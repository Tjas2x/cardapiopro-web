"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Restaurant = {
  id: string;
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  isOpen: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  active: boolean;
  restaurantId: string;
};

type CartItem = {
  product: Product;
  qty: number;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type ToastType = "success" | "error" | "info";

export default function MenuClient({ restaurantId }: { restaurantId: string }) {
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://cardapiopro-backend.onrender.com";

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cart, setCart] = useState<Record<string, CartItem>>({});

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(
    null
  );
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [cartOpen, setCartOpen] = useState(false);

  function showToast(type: ToastType, msg: string) {
    setToast({ type, msg });

    if (toastTimer.current) clearTimeout(toastTimer.current);

    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3000);
  }

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const totalItems = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.qty, 0);
  }, [cartItems]);

  const totalCents = useMemo(() => {
    return cartItems.reduce(
      (acc, item) => acc + item.product.priceCents * item.qty,
      0
    );
  }, [cartItems]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products
      .filter((p) => {
        if (filter === "ACTIVE") return p.active;
        if (filter === "INACTIVE") return !p.active;
        return true;
      })
      .filter((p) => {
        if (!q) return true;
        const inName = p.name.toLowerCase().includes(q);
        const inDesc = (p.description || "").toLowerCase().includes(q);
        return inName || inDesc;
      });
  }, [products, search, filter]);

  async function loadMenu() {
    try {
      setLoading(true);
      setLoadError(null);

      const r = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
        cache: "no-store",
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Erro ao carregar restaurante (${r.status}). ${txt}`);
      }

      const restaurantData: Restaurant = await r.json();
      setRestaurant(restaurantData);

      const p = await fetch(`${API_URL}/restaurants/${restaurantId}/products`, {
        cache: "no-store",
      });

      const productsData: Product[] = p.ok ? await p.json() : [];
      setProducts(productsData);
    } catch (e: any) {
      setLoadError(e?.message || "Falha ao carregar cardápio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  function addProduct(p: Product) {
    if (!p.active) return;

    setCart((prev) => {
      const existing = prev[p.id];
      const nextQty = (existing?.qty ?? 0) + 1;

      return {
        ...prev,
        [p.id]: { product: p, qty: nextQty },
      };
    });
  }

  function removeProduct(p: Product) {
    setCart((prev) => {
      const existing = prev[p.id];
      if (!existing) return prev;

      const nextQty = existing.qty - 1;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      }

      return {
        ...prev,
        [p.id]: { product: p, qty: nextQty },
      };
    });
  }

  function clearCart() {
    setCart({});
  }

  async function postWithRetry(url: string, body: any, tries = 2) {
    let lastError: any;

    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) return res;

        const txt = await res.text().catch(() => "");
        throw new Error(`Erro (${res.status}): ${txt}`);
      } catch (err: any) {
        lastError = err;

        const msg = String(err?.message || err);
        const isRetryable =
          msg.includes("aborted") ||
          msg.includes("AbortError") ||
          msg.includes("Network request failed") ||
          msg.includes("Failed to fetch");

        if (!isRetryable) break;

        await new Promise((r) => setTimeout(r, 800));
      }
    }

    throw lastError;
  }

  async function finalizeOrder() {
    if (!restaurant) {
      showToast("error", "Cardápio ainda não carregou.");
      return;
    }

    if (!restaurant.isOpen) {
      showToast("error", "Restaurante está fechado no momento.");
      return;
    }

    if (cartItems.length === 0) {
      showToast("error", "Seu carrinho está vazio.");
      return;
    }

    if (
      !customerName.trim() ||
      !customerPhone.trim() ||
      !customerAddress.trim()
    ) {
      showToast("error", "Preencha Nome, Telefone e Endereço.");
      return;
    }

    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      showToast("info", "Enviando pedido...");

      const payload = {
        restaurantId: restaurant.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        items: cartItems.map((i) => ({
          productId: i.product.id,
          quantity: i.qty,
        })),
      };

      await postWithRetry(`${API_URL}/public/orders`, payload, 2);

      showToast("success", "Pedido enviado com sucesso ✅");

      clearCart();
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setCartOpen(false);
    } catch (e: any) {
      showToast("error", e?.message || "Falha ao finalizar pedido.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-100 px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-extrabold">Carregando cardápio...</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Buscando restaurante e produtos...
          </p>

          <div className="mt-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="flex gap-3">
                  <div className="w-[86px] h-[86px] rounded-xl bg-zinc-200 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 bg-zinc-200 rounded animate-pulse" />
                    <div className="h-3 w-full bg-zinc-200 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-zinc-200 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !restaurant) {
    return (
      <main className="min-h-screen bg-zinc-100 px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-extrabold">Não foi possível carregar</h1>
          <p className="text-sm text-zinc-700 mt-2">{loadError}</p>

          <button
            onClick={loadMenu}
            className="mt-4 rounded-2xl px-4 py-3 text-sm font-bold border bg-white"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Toast */}
      {toast ? (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg border ${
              toast.type === "success"
                ? "bg-green-50 text-green-700 border-green-200"
                : toast.type === "error"
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-zinc-50 text-zinc-800 border-zinc-200"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      ) : null}

      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold tracking-tight truncate">
                {restaurant.name || "Cardápio"}
              </h1>

              <p className="text-sm text-zinc-600 mt-1">
                {restaurant.description || "Faça seu pedido abaixo 👇"}
              </p>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-1 rounded-full font-semibold ${
                    restaurant.isOpen
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {restaurant.isOpen ? "Aberto" : "Fechado"}
                </span>

                {restaurant.address ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700">
                    📍 {restaurant.address}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 rounded-full bg-zinc-900 text-white text-xs px-3 py-1 font-semibold">
              {products.length} produto(s)
            </div>
          </div>

          {/* Search + filters */}
          <div className="mt-4 flex flex-col gap-2">
            <input
              className="w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setFilter("ALL")}
                className={`flex-1 rounded-2xl px-3 py-2 text-xs font-extrabold border ${
                  filter === "ALL"
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-900"
                }`}
              >
                Todos
              </button>

              <button
                onClick={() => setFilter("ACTIVE")}
                className={`flex-1 rounded-2xl px-3 py-2 text-xs font-extrabold border ${
                  filter === "ACTIVE"
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-900"
                }`}
              >
                Disponíveis
              </button>

              <button
                onClick={() => setFilter("INACTIVE")}
                className={`flex-1 rounded-2xl px-3 py-2 text-xs font-extrabold border ${
                  filter === "INACTIVE"
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-900"
                }`}
              >
                Indisponíveis
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6 pb-44">
        {/* Produtos */}
        <section>
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg font-extrabold">Produtos</h2>
            <p className="text-xs text-zinc-600">{filteredProducts.length}</p>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredProducts.map((p) => {
                const inCartQty = cart[p.id]?.qty ?? 0;

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Thumb + infos */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-[92px] h-[92px] rounded-2xl object-cover border"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-[92px] h-[92px] rounded-2xl border bg-zinc-50 flex items-center justify-center text-xs font-semibold text-zinc-500">
                            Sem foto
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-zinc-900 truncate">
                              {p.name}
                            </h3>

                            {!p.active ? (
                              <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 font-bold">
                                Indisponível
                              </span>
                            ) : null}
                          </div>

                          {p.description ? (
                            <p className="text-sm text-zinc-600 mt-1 leading-snug line-clamp-2">
                              {p.description}
                            </p>
                          ) : null}

                          <div className="mt-3 flex items-center justify-between">
                            <p className="text-base font-extrabold text-zinc-900">
                              {formatBRL(p.priceCents)}
                            </p>

                            {p.active ? (
                              inCartQty === 0 ? (
                                <button
                                  onClick={() => addProduct(p)}
                                  className="rounded-2xl px-4 py-2 text-sm font-extrabold bg-green-600 text-white"
                                >
                                  Adicionar
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => removeProduct(p)}
                                    className="rounded-2xl px-3 py-2 text-sm font-extrabold bg-zinc-200"
                                  >
                                    -
                                  </button>

                                  <span className="text-sm font-extrabold w-6 text-center">
                                    {inCartQty}
                                  </span>

                                  <button
                                    onClick={() => addProduct(p)}
                                    className="rounded-2xl px-3 py-2 text-sm font-extrabold bg-green-600 text-white"
                                  >
                                    +
                                  </button>
                                </div>
                              )
                            ) : (
                              <button
                                disabled
                                className="rounded-2xl px-4 py-2 text-sm font-extrabold bg-zinc-200 text-zinc-500 cursor-not-allowed"
                              >
                                Indisponível
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Checkout (fica aqui mas o fluxo principal é via modal) */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-extrabold">Seus dados</h2>

          <div className="space-y-2">
            <input
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="Nome"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <input
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="Telefone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />

            <input
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="Endereço"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className="w-full rounded-2xl px-4 py-3 text-sm font-extrabold bg-zinc-900 text-white"
          >
            Abrir carrinho
          </button>
        </section>
      </main>

      {/* Bottom bar (iFood-like) */}
      {totalItems > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setCartOpen(true)}
              className="flex-1 rounded-2xl px-4 py-3 text-sm font-extrabold bg-green-600 text-white flex items-center justify-between"
            >
              <span>Ver carrinho</span>
              <span className="text-white/90">
                {totalItems} • {formatBRL(totalCents)}
              </span>
            </button>

            <button
              onClick={() => {
                clearCart();
                showToast("info", "Carrinho limpo.");
              }}
              className="shrink-0 rounded-2xl px-4 py-3 text-sm font-extrabold bg-zinc-100 text-zinc-800 border"
            >
              Limpar
            </button>
          </div>
        </div>
      ) : null}

      {/* Cart Modal */}
      {cartOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
          />

          <div className="absolute bottom-0 left-0 right-0">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-t-3xl border bg-white shadow-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold">Seu carrinho</h3>
                    <p className="text-xs text-zinc-600 mt-1">
                      {totalItems} item(ns) • {formatBRL(totalCents)}
                    </p>
                  </div>

                  <button
                    onClick={() => setCartOpen(false)}
                    className="rounded-2xl px-4 py-2 text-sm font-extrabold border bg-white"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mt-4 space-y-3 max-h-[45vh] overflow-auto pr-1">
                  {cartItems.length === 0 ? (
                    <div className="rounded-2xl border bg-zinc-50 p-4 text-sm text-zinc-600">
                      Seu carrinho está vazio.
                    </div>
                  ) : (
                    cartItems.map((i) => (
                      <div
                        key={i.product.id}
                        className="rounded-2xl border p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold truncate">
                            {i.product.name}
                          </p>
                          <p className="text-xs text-zinc-600">
                            {formatBRL(i.product.priceCents)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => removeProduct(i.product)}
                            className="rounded-2xl px-3 py-2 text-sm font-extrabold bg-zinc-200"
                          >
                            -
                          </button>

                          <span className="text-sm font-extrabold w-6 text-center">
                            {i.qty}
                          </span>

                          <button
                            onClick={() => addProduct(i.product)}
                            className="rounded-2xl px-3 py-2 text-sm font-extrabold bg-green-600 text-white"
                          >
                            +
                          </button>
                        </div>

                        <p className="text-sm font-extrabold">
                          {formatBRL(i.product.priceCents * i.qty)}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-600">Total</p>
                    <p className="text-lg font-extrabold">
                      {formatBRL(totalCents)}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <input
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      placeholder="Nome"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />

                    <input
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      placeholder="Telefone"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />

                    <input
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      placeholder="Endereço"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={finalizeOrder}
                    disabled={isSubmitting}
                    className="w-full rounded-2xl px-4 py-4 text-sm font-extrabold bg-green-600 text-white disabled:opacity-50"
                  >
                    {isSubmitting ? "Enviando..." : "Finalizar pedido"}
                  </button>

                  <button
                    onClick={() => {
                      clearCart();
                      setCartOpen(false);
                      showToast("info", "Carrinho limpo.");
                    }}
                    className="w-full rounded-2xl px-4 py-3 text-sm font-extrabold border bg-white"
                  >
                    Limpar carrinho
                  </button>
                </div>
              </div>

              <div className="h-3 bg-transparent" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

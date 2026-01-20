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
    process.env.NEXT_PUBLIC_API_URL || "https://cardapiopro-backend.onrender.com";

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

  function showToast(type: ToastType, msg: string) {
    setToast({ type, msg });

    if (toastTimer.current) clearTimeout(toastTimer.current);

    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3500);
  }

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const totalCents = useMemo(() => {
    return cartItems.reduce(
      (acc, item) => acc + item.product.priceCents * item.qty,
      0
    );
  }, [cartItems]);

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

        // pequeno delay antes do retry
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

      setCart({});
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
    } catch (e: any) {
      showToast("error", e?.message || "Falha ao finalizar pedido.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Carregando cardápio...</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Carregando restaurante e produtos...
        </p>
      </main>
    );
  }

  if (loadError || !restaurant) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Não foi possível carregar</h1>
        <p style={{ marginTop: 8 }}>{loadError}</p>

        <button
          onClick={loadMenu}
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        >
          Tentar novamente
        </button>
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

      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">
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

            <div className="shrink-0 rounded-full bg-black text-white text-xs px-3 py-1 font-semibold">
              {products.length} produto(s)
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6 pb-40">
        {/* Produtos */}
        <section>
          <h2 className="text-lg font-bold mb-3">Produtos</h2>

          {products.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {products.map((p) => {
                const inCartQty = cart[p.id]?.qty ?? 0;

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-zinc-900 truncate">
                          {p.name}
                        </h3>

                        {p.description ? (
                          <p className="text-sm text-zinc-600 mt-1 leading-snug">
                            {p.description}
                          </p>
                        ) : null}

                        <p className="mt-2 text-sm font-bold text-zinc-900">
                          {formatBRL(p.priceCents)}
                        </p>

                        {!p.active ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            Indisponível
                          </p>
                        ) : null}
                      </div>

                      {p.active ? (
                        <div className="flex flex-col items-end gap-2">
                          {inCartQty === 0 ? (
                            <button
                              onClick={() => addProduct(p)}
                              className="rounded-xl px-4 py-2 text-sm font-semibold bg-black text-white"
                            >
                              Adicionar
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => removeProduct(p)}
                                className="rounded-xl px-3 py-2 text-sm font-semibold bg-zinc-200"
                              >
                                -
                              </button>
                              <span className="text-sm font-semibold w-6 text-center">
                                {inCartQty}
                              </span>
                              <button
                                onClick={() => addProduct(p)}
                                className="rounded-xl px-3 py-2 text-sm font-semibold bg-black text-white"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          disabled
                          className="rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-200 text-zinc-500 cursor-not-allowed"
                        >
                          Indisponível
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Carrinho */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-bold">Carrinho</h2>

          {cartItems.length === 0 ? (
            <p className="text-sm text-zinc-600">Seu carrinho está vazio.</p>
          ) : (
            <div className="space-y-2">
              {cartItems.map((i) => (
                <div
                  key={i.product.id}
                  className="flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {i.product.name}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {i.qty} × {formatBRL(i.product.priceCents)}
                    </p>
                  </div>

                  <p className="text-sm font-bold">
                    {formatBRL(i.product.priceCents * i.qty)}
                  </p>
                </div>
              ))}

              <div className="border-t pt-3 flex items-center justify-between">
                <p className="text-sm text-zinc-600">Total</p>
                <p className="text-lg font-bold">{formatBRL(totalCents)}</p>
              </div>
            </div>
          )}
        </section>

        {/* Dados do cliente */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-bold">Seus dados</h2>

          <div className="space-y-2">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Nome"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Telefone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Endereço"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          <button
            onClick={finalizeOrder}
            disabled={isSubmitting}
            className="w-full rounded-2xl px-4 py-3 text-sm font-bold bg-green-600 text-white disabled:opacity-50"
          >
            {isSubmitting ? "Enviando..." : "Finalizar pedido"}
          </button>
        </section>
      </main>
    </div>
  );
}

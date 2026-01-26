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

type ToastType = "success" | "error" | "info";

type PaymentMethod = "PIX" | "CARD_CREDIT" | "CARD_DEBIT" | "CASH";

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

// (99) 99999-9999
function formatPhoneBR(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);

  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;

  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function sanitizePhoneForWhatsApp(phone: string) {
  const d = onlyDigits(phone);
  if (!d) return null;

  if (d.startsWith("55")) return d;
  return `55${d}`;
}

function parseBRLToCents(input: string) {
  // aceita: "50", "50,00", "R$ 50,00"
  const raw = String(input || "").trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");

  const val = Number(cleaned);
  if (!Number.isFinite(val)) return null;

  const cents = Math.round(val * 100);
  if (cents <= 0) return null;

  return cents;
}

function paymentLabel(pm: PaymentMethod) {
  switch (pm) {
    case "PIX":
      return "PIX";
    case "CARD_CREDIT":
      return "Cartão (Crédito)";
    case "CARD_DEBIT":
      return "Cartão (Débito)";
    case "CASH":
      return "Dinheiro";
    default:
      return pm;
  }
}

export default function MenuClient({ restaurantId }: { restaurantId: string }) {
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://cardapiopro-backend.onrender.com";

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingFirst, setLoadingFirst] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [cartOpen, setCartOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ pagamento
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [cashChangeFor, setCashChangeFor] = useState("");

  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(
    null
  );
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  function showToast(type: ToastType, msg: string) {
    setToast({ type, msg });

    if (toastTimer.current) clearTimeout(toastTimer.current);

    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3200);
  }

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const totalCents = useMemo(() => {
    return cartItems.reduce(
      (acc, item) => acc + item.product.priceCents * item.qty,
      0
    );
  }, [cartItems]);

  const productsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = products;

    if (tab === "ACTIVE") list = list.filter((p) => p.active);
    if (tab === "INACTIVE") list = list.filter((p) => !p.active);

    if (!q) return list;

    return list.filter((p) => {
      const a = p.name.toLowerCase();
      const b = (p.description || "").toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [products, search, tab]);

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

  function syncCartWithProducts(nextProducts: Product[]) {
    const map = new Map(nextProducts.map((p) => [p.id, p]));
    let changed = false;

    setCart((prev) => {
      const copy = { ...prev };

      for (const productId of Object.keys(copy)) {
        const exists = map.get(productId);

        if (!exists) {
          delete copy[productId];
          changed = true;
          continue;
        }

        if (!exists.active) {
          delete copy[productId];
          changed = true;
          continue;
        }

        copy[productId] = {
          ...copy[productId],
          product: exists,
        };
      }

      return copy;
    });

    if (changed) {
      showToast(
        "info",
        "Alguns itens ficaram indisponíveis e foram removidos do carrinho."
      );
    }
  }

  async function fetchRestaurant() {
    const r = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
      cache: "no-store",
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Erro ao carregar restaurante (${r.status}). ${txt}`);
    }

    const data: Restaurant = await r.json();
    return data;
  }

  async function fetchProducts() {
    const p = await fetch(`${API_URL}/restaurants/${restaurantId}/products`, {
      cache: "no-store",
    });

    if (!p.ok) {
      return [] as Product[];
    }

    const data: Product[] = await p.json();
    return data;
  }

  async function loadFirstTime() {
    try {
      setLoadingFirst(true);
      setLoadError(null);

      const [r, p] = await Promise.all([fetchRestaurant(), fetchProducts()]);

      setRestaurant(r);
      setProducts(p);
      syncCartWithProducts(p);
    } catch (e: any) {
      setLoadError(e?.message || "Falha ao carregar cardápio.");
    } finally {
      setLoadingFirst(false);
    }
  }

  async function refreshSilent() {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [r, p] = await Promise.all([fetchRestaurant(), fetchProducts()]);
      setRestaurant(r);
      setProducts(p);
      syncCartWithProducts(p);
    } catch {
    } finally {
      isFetchingRef.current = false;
    }
  }

  useEffect(() => {
    loadFirstTime();

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(() => {
      refreshSilent();
    }, 15000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;

      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

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

  function validateCustomer() {
    const errors: { field: string; msg: string }[] = [];

    if (!customerName.trim()) errors.push({ field: "name", msg: "Nome" });
    if (onlyDigits(customerPhone).length < 10)
      errors.push({ field: "phone", msg: "Telefone válido" });
    if (!customerAddress.trim())
      errors.push({ field: "address", msg: "Endereço" });

    return errors;
  }

  function validatePayment(totalCents: number) {
    if (paymentMethod !== "CASH") return null;

    // no server a gente aceita null, mas aqui é melhor recomendar.
    // se deixar vazio, OK
    if (!cashChangeFor.trim()) return null;

    const changeForCents = parseBRLToCents(cashChangeFor);
    if (!changeForCents) {
      return "Informe o valor do troco (ex: 50,00) ou deixe em branco.";
    }

    if (changeForCents < totalCents) {
      return `Troco inválido. O valor precisa ser maior ou igual ao total (${formatBRL(
        totalCents
      )}).`;
    }

    return null;
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

    const errors = validateCustomer();
    if (errors.length > 0) {
      showToast("error", `Preencha: ${errors.map((e) => e.msg).join(", ")}.`);
      return;
    }

    const payError = validatePayment(totalCents);
    if (payError) {
      showToast("error", payError);
      return;
    }

    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      showToast("info", "Enviando pedido...");

      const freshProducts = await fetchProducts();

      const freshMap = new Map(freshProducts.map((p) => [p.id, p]));
      const safeItems = cartItems
        .map((i) => {
          const exists = freshMap.get(i.product.id);
          if (!exists) return null;
          if (!exists.active) return null;
          return { product: exists, qty: i.qty };
        })
        .filter(Boolean) as { product: Product; qty: number }[];

      if (safeItems.length === 0) {
        clearCart();
        showToast(
          "error",
          "Os itens do carrinho ficaram indisponíveis. Selecione novamente."
        );
        return;
      }

      if (safeItems.length !== cartItems.length) {
        const next: Record<string, CartItem> = {};
        safeItems.forEach((s) => {
          next[s.product.id] = { product: s.product, qty: s.qty };
        });
        setCart(next);

        showToast(
          "info",
          "Alguns itens ficaram indisponíveis e foram removidos do carrinho."
        );
        return;
      }

      const cashChangeForCents =
        paymentMethod === "CASH" ? parseBRLToCents(cashChangeFor) : null;

      const payload = {
        restaurantId: restaurant.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        paymentMethod,
        cashChangeForCents,
        items: safeItems.map((i) => ({
          productId: i.product.id,
          quantity: i.qty,
        })),
      };

      const res = await postWithRetry(`${API_URL}/public/orders`, payload, 2);

      let orderId: string | null = null;
      try {
        const json = await res.json();
        if (json?.orderId) orderId = String(json.orderId);
      } catch {}

      showToast("success", "Pedido enviado com sucesso ✅");

      setCart({});
      setCartOpen(false);

      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setPaymentMethod("PIX");
      setCashChangeFor("");

      if (orderId) {
        setTimeout(() => {
          window.location.href = `/pedido/${orderId}`;
        }, 500);
      }
    } catch (e: any) {
      showToast("error", e?.message || "Falha ao finalizar pedido.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadingFirst) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-xl font-bold">Carregando cardápio...</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Carregando restaurante e produtos...
          </p>
        </div>
      </main>
    );
  }

  if (loadError || !restaurant) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-xl font-bold">Não foi possível carregar</h1>
          <p className="text-sm text-zinc-700 mt-2">{loadError}</p>

          <button
            onClick={loadFirstTime}
            className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold bg-black text-white"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  const waPhone = restaurant.phone
    ? sanitizePhoneForWhatsApp(restaurant.phone)
    : null;

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Toast */}
      {toast ? (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60]">
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

      {/* WhatsApp */}
      {waPhone ? (
        <a
          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
            `Olá! Vim pelo cardápio do ${restaurant.name}.`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-20 right-4 z-[55] rounded-full px-4 py-3 bg-green-600 text-white font-bold shadow-lg"
        >
          WhatsApp
        </a>
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

          {/* Search + tabs */}
          <div className="mt-4 flex flex-col gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full rounded-2xl border px-4 py-3 text-sm bg-white"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setTab("ALL")}
                className={`flex-1 rounded-2xl px-4 py-2 text-sm font-bold border ${
                  tab === "ALL"
                    ? "bg-black text-white border-black"
                    : "bg-white text-zinc-900 border-zinc-200"
                }`}
              >
                Todos
              </button>

              <button
                onClick={() => setTab("ACTIVE")}
                className={`flex-1 rounded-2xl px-4 py-2 text-sm font-bold border ${
                  tab === "ACTIVE"
                    ? "bg-black text-white border-black"
                    : "bg-white text-zinc-900 border-zinc-200"
                }`}
              >
                Disponíveis
              </button>

              <button
                onClick={() => setTab("INACTIVE")}
                className={`flex-1 rounded-2xl px-4 py-2 text-sm font-bold border ${
                  tab === "INACTIVE"
                    ? "bg-black text-white border-black"
                    : "bg-white text-zinc-900 border-zinc-200"
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Produtos</h2>
            <span className="text-sm text-zinc-500">
              {productsFiltered.length}
            </span>
          </div>

          {productsFiltered.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {productsFiltered.map((p) => {
                const inCartQty = cart[p.id]?.qty ?? 0;

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-[86px] h-[86px] rounded-xl object-cover border"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-[86px] h-[86px] rounded-xl border bg-zinc-50 flex items-center justify-center text-xs font-semibold text-zinc-500">
                            Sem foto
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-zinc-900 truncate">
                            {p.name}
                          </h3>

                          {p.description ? (
                            <p className="text-sm text-zinc-600 mt-1 leading-snug line-clamp-2">
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
                      </div>

                      {/* Botões */}
                      {p.active ? (
                        <div className="flex flex-col items-end gap-2">
                          {inCartQty === 0 ? (
                            <button
                              onClick={() => addProduct(p)}
                              className="rounded-xl px-4 py-2 text-sm font-semibold bg-green-600 text-white"
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
                                className="rounded-xl px-3 py-2 text-sm font-semibold bg-green-600 text-white"
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

        {/* Dados do cliente */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-bold">Seus dados</h2>

          <div className="space-y-2">
            <input
              className="w-full rounded-xl border px-3 py-3 text-sm"
              placeholder="Nome"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <input
              className="w-full rounded-xl border px-3 py-3 text-sm"
              placeholder="Telefone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(formatPhoneBR(e.target.value))}
              inputMode="tel"
            />

            <input
              className="w-full rounded-xl border px-3 py-3 text-sm"
              placeholder="Endereço"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>
        </section>
      </main>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur z-50">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setCartOpen(true)}
            className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold bg-black text-white"
          >
            {cartItems.length === 0
              ? "Abrir carrinho"
              : `Carrinho • ${cartItems.length} item(s) • ${formatBRL(
                  totalCents
                )}`}
          </button>

          <button
            onClick={refreshSilent}
            className="rounded-2xl px-4 py-3 text-sm font-bold border bg-white"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Cart modal */}
      {cartOpen ? (
        <div className="fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-t-3xl bg-white p-5 shadow-xl border">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Carrinho</h3>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="rounded-xl px-3 py-2 text-sm font-bold bg-zinc-200"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mt-4 space-y-3 max-h-[55vh] overflow-auto pr-1">
                  {cartItems.length === 0 ? (
                    <p className="text-sm text-zinc-600">
                      Seu carrinho está vazio.
                    </p>
                  ) : (
                    <>
                      {cartItems.map((i) => (
                        <div
                          key={i.product.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {i.product.name}
                            </p>
                            <p className="text-xs text-zinc-600">
                              {i.qty} × {formatBRL(i.product.priceCents)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => removeProduct(i.product)}
                              className="rounded-xl px-3 py-2 text-sm font-bold bg-zinc-200"
                            >
                              -
                            </button>
                            <span className="text-sm font-bold w-6 text-center">
                              {i.qty}
                            </span>
                            <button
                              onClick={() => addProduct(i.product)}
                              className="rounded-xl px-3 py-2 text-sm font-bold bg-black text-white"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="border-t pt-3 flex items-center justify-between">
                        <p className="text-sm text-zinc-600">Total</p>
                        <p className="text-lg font-bold">
                          {formatBRL(totalCents)}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* ✅ Pagamento */}
                <div className="mt-4 rounded-2xl border bg-zinc-50 p-4">
                  <p className="text-sm font-bold text-zinc-900">
                    Forma de pagamento
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        "PIX",
                        "CARD_CREDIT",
                        "CARD_DEBIT",
                        "CASH",
                      ] as PaymentMethod[]
                    ).map((pm) => {
                      const active = paymentMethod === pm;
                      return (
                        <button
                          key={pm}
                          onClick={() => setPaymentMethod(pm)}
                          className={`rounded-2xl px-3 py-3 text-sm font-bold border ${
                            active
                              ? "bg-black text-white border-black"
                              : "bg-white text-zinc-900 border-zinc-200"
                          }`}
                        >
                          {paymentLabel(pm)}
                        </button>
                      );
                    })}
                  </div>

                  {paymentMethod === "PIX" ? (
                    <p className="text-xs text-zinc-600 mt-3">
                      Você pode combinar o pagamento via WhatsApp após enviar o
                      pedido.
                    </p>
                  ) : null}

                  {paymentMethod === "CASH" ? (
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Troco para quanto? (opcional)
                      </label>
                      <input
                        className="w-full rounded-xl border px-3 py-3 text-sm bg-white"
                        placeholder="Ex: 50,00"
                        value={cashChangeFor}
                        onChange={(e) => setCashChangeFor(e.target.value)}
                        inputMode="decimal"
                      />
                      <p className="text-xs text-zinc-500 mt-2">
                        Se não precisar de troco, pode deixar em branco.
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={clearCart}
                    disabled={cartItems.length === 0}
                    className="rounded-2xl px-4 py-3 text-sm font-bold border bg-white disabled:opacity-40"
                  >
                    Limpar
                  </button>

                  <button
                    onClick={finalizeOrder}
                    disabled={isSubmitting || cartItems.length === 0}
                    className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold bg-green-600 text-white disabled:opacity-50"
                  >
                    {isSubmitting ? "Enviando..." : "Finalizar pedido"}
                  </button>
                </div>

                <p className="text-xs text-zinc-500 mt-3">
                  Se algum item ficar indisponível, ele será removido
                  automaticamente.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

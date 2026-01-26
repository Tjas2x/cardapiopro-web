"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =========================
   Types
========================= */
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
};

type CartItem = {
  product: Product;
  qty: number;
};

type PaymentMethod = "PIX" | "CARD_CREDIT" | "CARD_DEBIT" | "CASH";

type ToastType = "success" | "error" | "info";

/* =========================
   Helpers
========================= */
function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

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
  return d.startsWith("55") ? d : `55${d}`;
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
  }
}

/* =========================
   Component
========================= */
export default function MenuClient({ restaurantId }: { restaurantId: string }) {
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://cardapiopro-backend.onrender.com";

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [cartOpen, setCartOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("PIX");
  const [cashChangeFor, setCashChangeFor] = useState("");

  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(
    null
  );
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  function showToast(type: ToastType, msg: string) {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  /* =========================
     Data
  ========================= */
  async function loadData() {
    try {
      setLoading(true);
      const [r, p] = await Promise.all([
        fetch(`${API_URL}/restaurants/${restaurantId}`).then((r) => r.json()),
        fetch(`${API_URL}/restaurants/${restaurantId}/products`).then((p) =>
          p.json()
        ),
      ]);
      setRestaurant(r);
      setProducts(p);
    } catch {
      setError("Não foi possível carregar o cardápio.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [restaurantId]);

  /* =========================
     Cart
  ========================= */
  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const totalCents = useMemo(
    () =>
      cartItems.reduce(
        (acc, i) => acc + i.product.priceCents * i.qty,
        0
      ),
    [cartItems]
  );

  function addProduct(p: Product) {
    if (!p.active) return;
    setCart((prev) => ({
      ...prev,
      [p.id]: { product: p, qty: (prev[p.id]?.qty || 0) + 1 },
    }));
  }

  function removeProduct(p: Product) {
    setCart((prev) => {
      const q = (prev[p.id]?.qty || 0) - 1;
      if (q <= 0) {
        const c = { ...prev };
        delete c[p.id];
        return c;
      }
      return { ...prev, [p.id]: { product: p, qty: q } };
    });
  }

  /* =========================
     Filters
  ========================= */
  const filteredProducts = useMemo(() => {
    let list = products;
    if (tab === "ACTIVE") list = list.filter((p) => p.active);
    if (tab === "INACTIVE") list = list.filter((p) => !p.active);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }, [products, tab, search]);

  /* =========================
     UI
  ========================= */
  if (loading)
    return (
      <main className="min-h-screen bg-zinc-100 p-4">
        <p className="text-sm text-zinc-600">Carregando cardápio…</p>
      </main>
    );

  if (error || !restaurant)
    return (
      <main className="min-h-screen bg-zinc-100 p-4">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );

  const waPhone = restaurant.phone
    ? sanitizePhoneForWhatsApp(restaurant.phone)
    : null;

  return (
    <div className="min-h-screen bg-zinc-100 pb-40">
      {/* ===== HEADER COMPACTO ===== */}
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-2">
          <h1 className="text-lg font-bold truncate">{restaurant.name}</h1>

          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <span
              className={`px-2 py-0.5 rounded-full font-semibold ${
                restaurant.isOpen
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {restaurant.isOpen ? "Aberto" : "Fechado"}
            </span>

            {restaurant.address && (
              <span className="truncate">📍 {restaurant.address}</span>
            )}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto…"
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
          />

          {/* Tabs */}
          <div className="mt-2 flex gap-2">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold border ${
                  tab === t
                    ? "bg-black text-white border-black"
                    : "bg-white text-zinc-800 border-zinc-200"
                }`}
              >
                {t === "ALL"
                  ? "Todos"
                  : t === "ACTIVE"
                  ? "Disponíveis"
                  : "Indisponíveis"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ===== PRODUTOS ===== */}
      <main className="mx-auto max-w-3xl px-4 py-4 space-y-3">
        {filteredProducts.map((p) => {
          const qty = cart[p.id]?.qty || 0;
          return (
            <div
              key={p.id}
              className="rounded-2xl border bg-white p-3 flex gap-3"
            >
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  className="w-20 h-20 rounded-xl object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-zinc-100 flex items-center justify-center text-xs">
                  Sem foto
                </div>
              )}

              <div className="flex-1">
                <h3 className="font-semibold">{p.name}</h3>
                {p.description && (
                  <p className="text-xs text-zinc-600 line-clamp-2">
                    {p.description}
                  </p>
                )}
                <p className="mt-1 font-bold text-sm">
                  {formatBRL(p.priceCents)}
                </p>
              </div>

              {p.active ? (
                qty === 0 ? (
                  <button
                    onClick={() => addProduct(p)}
                    className="rounded-xl px-4 py-2 text-sm font-bold bg-green-600 text-white"
                  >
                    Adicionar
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeProduct(p)}
                      className="px-3 py-2 rounded-xl bg-zinc-200"
                    >
                      −
                    </button>
                    <span className="font-bold">{qty}</span>
                    <button
                      onClick={() => addProduct(p)}
                      className="px-3 py-2 rounded-xl bg-green-600 text-white"
                    >
                      +
                    </button>
                  </div>
                )
              ) : (
                <span className="text-xs text-zinc-500">Indisponível</span>
              )}
            </div>
          );
        })}
      </main>

      {/* WhatsApp */}
      {waPhone && (
        <a
          href={`https://wa.me/${waPhone}`}
          target="_blank"
          className="fixed bottom-24 right-4 bg-green-600 text-white px-4 py-3 rounded-full font-bold shadow-lg"
        >
          WhatsApp
        </a>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="mx-auto max-w-3xl px-4 py-3 flex gap-2">
          <button
            onClick={() => setCartOpen(true)}
            className="flex-1 rounded-2xl bg-black text-white py-3 font-bold"
          >
            {cartItems.length === 0
              ? "Abrir carrinho"
              : `Carrinho • ${formatBRL(totalCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

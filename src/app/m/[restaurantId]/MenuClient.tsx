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
  restaurantId: string;
};

type CartItem = {
  product: Product;
  qty: number;
};

type ToastType = "success" | "error" | "info";

type PaymentMethod = "PIX" | "CARD_CREDIT" | "CARD_DEBIT" | "CASH";

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
  if (d.startsWith("55")) return d;
  return `55${d}`;
}

function parseBRLToCents(input: string) {
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

/* =========================
   Component
========================= */

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

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("PIX");
  const [cashChangeFor, setCashChangeFor] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(
    null
  );

  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);

  function showToast(type: ToastType, msg: string) {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const totalCents = useMemo(
    () =>
      cartItems.reduce(
        (acc, item) => acc + item.product.priceCents * item.qty,
        0
      ),
    [cartItems]
  );

  const productsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products;
    if (tab === "ACTIVE") list = list.filter((p) => p.active);
    if (tab === "INACTIVE") list = list.filter((p) => !p.active);
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }, [products, search, tab]);

  function addProduct(p: Product) {
    if (!p.active) return;
    setCart((prev) => ({
      ...prev,
      [p.id]: { product: p, qty: (prev[p.id]?.qty ?? 0) + 1 },
    }));
  }

  function removeProduct(p: Product) {
    setCart((prev) => {
      const existing = prev[p.id];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      }
      return {
        ...prev,
        [p.id]: { product: p, qty: existing.qty - 1 },
      };
    });
  }

  function clearCart() {
    setCart({});
  }

  async function fetchRestaurant() {
    const r = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("Erro ao carregar restaurante");
    return (await r.json()) as Restaurant;
  }

  async function fetchProducts() {
    const r = await fetch(
      `${API_URL}/restaurants/${restaurantId}/products`,
      { cache: "no-store" }
    );
    if (!r.ok) return [];
    return (await r.json()) as Product[];
  }

  async function loadFirstTime() {
    try {
      setLoadingFirst(true);
      const [r, p] = await Promise.all([
        fetchRestaurant(),
        fetchProducts(),
      ]);
      setRestaurant(r);
      setProducts(p);
    } catch (e: any) {
      setLoadError(e?.message || "Falha ao carregar cardápio");
    } finally {
      setLoadingFirst(false);
    }
  }

  async function refreshSilent() {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const [r, p] = await Promise.all([
        fetchRestaurant(),
        fetchProducts(),
      ]);
      setRestaurant(r);
      setProducts(p);
    } finally {
      isFetchingRef.current = false;
    }
  }

  useEffect(() => {
    loadFirstTime();
    pollingRef.current = setInterval(refreshSilent, 15000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [restaurantId]);

  function validateCustomer() {
    if (!customerName.trim()) return "Informe seu nome";
    if (onlyDigits(customerPhone).length < 10)
      return "Informe um telefone válido";
    if (!customerAddress.trim()) return "Informe o endereço";
    return null;
  }

  async function finalizeOrder() {
    if (!restaurant || !restaurant.isOpen) {
      showToast("error", "Restaurante fechado");
      return;
    }
    if (cartItems.length === 0) {
      showToast("error", "Carrinho vazio");
      return;
    }

    const err = validateCustomer();
    if (err) {
      showToast("error", err);
      return;
    }

    setIsSubmitting(true);
    showToast("info", "Enviando pedido...");

    try {
      const payload = {
        restaurantId: restaurant.id,
        customerName,
        customerPhone,
        customerAddress,
        paymentMethod,
        cashChangeForCents:
          paymentMethod === "CASH"
            ? parseBRLToCents(cashChangeFor)
            : null,
        items: cartItems.map((i) => ({
          productId: i.product.id,
          quantity: i.qty,
        })),
      };

      const res = await fetch(`${API_URL}/public/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      const orderId = json?.orderId || json?.id || json?.order?.id;

      showToast("success", "Pedido enviado ✅");

      if (orderId) {
        setTimeout(() => {
          window.location.href = `/pedido/${orderId}`;
        }, 500);
      }
    } catch {
      showToast("error", "Pedido enviado, mas tracking ainda não disponível");
    } finally {
      setIsSubmitting(false);
      setCartOpen(false);
      clearCart();
    }
  }

  if (loadingFirst) {
    return <p className="p-6">Carregando cardápio...</p>;
  }

  if (loadError || !restaurant) {
    return <p className="p-6">{loadError}</p>;
  }

  const waPhone = restaurant.phone
    ? sanitizePhoneForWhatsApp(restaurant.phone)
    : null;

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* HEADER REDUZIDO */}
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <h1 className="text-lg font-bold">{restaurant.name}</h1>
          <p className="text-xs text-zinc-600">
            {restaurant.description || "Faça seu pedido"}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4 pb-40">
        {productsFiltered.map((p) => {
          const qty = cart[p.id]?.qty ?? 0;
          return (
            <div
              key={p.id}
              className="bg-white rounded-xl border p-4 flex justify-between"
            >
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm">{formatBRL(p.priceCents)}</p>
              </div>
              <div className="flex items-center gap-2">
                {qty > 0 && (
                  <button onClick={() => removeProduct(p)}>-</button>
                )}
                <span>{qty}</span>
                <button onClick={() => addProduct(p)}>+</button>
              </div>
            </div>
          );
        })}
      </main>

      {/* BOTTOM BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <button
          onClick={() => setCartOpen(true)}
          className="w-full bg-black text-white py-3 rounded-xl"
        >
          Carrinho • {formatBRL(totalCents)}
        </button>
      </div>

      {/* CARRINHO */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/40 z-50">
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5">
            <h3 className="font-bold mb-2">Finalizar pedido</h3>

            <input
              placeholder="Nome"
              className="w-full border p-2 mb-2"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              placeholder="Telefone"
              className="w-full border p-2 mb-2"
              value={customerPhone}
              onChange={(e) =>
                setCustomerPhone(formatPhoneBR(e.target.value))
              }
            />
            <input
              placeholder="Endereço"
              className="w-full border p-2 mb-3"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />

            <button
              disabled={isSubmitting}
              onClick={finalizeOrder}
              className="w-full bg-green-600 text-white py-3 rounded-xl"
            >
              {isSubmitting ? "Enviando..." : "Finalizar pedido"}
            </button>

            <button
              onClick={() => setCartOpen(false)}
              className="w-full mt-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

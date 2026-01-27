"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* =========================
   TYPES
   ========================= */

type OrderStatus =
  | "NEW"
  | "PREPARING"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELED";

type PaymentMethod = "PIX" | "CARD_CREDIT" | "CARD_DEBIT" | "CASH";

type OrderItem = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  nameSnapshot: string;
};

type Restaurant = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
};

type PublicOrder = {
  id: string;
  status: OrderStatus;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  totalCents: number;
  paymentMethod: PaymentMethod;
  cashChangeForCents: number | null;
  paid: boolean;
  createdAt: string;
  restaurant: Restaurant;
  items: OrderItem[];
};

/* =========================
   HELPERS
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

function sanitizePhoneForWhatsApp(phone: string) {
  const d = onlyDigits(phone);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  return `55${d}`;
}

function statusLabel(s: OrderStatus) {
  switch (s) {
    case "NEW":
      return "Recebido";
    case "PREPARING":
      return "Em preparo";
    case "OUT_FOR_DELIVERY":
      return "Saiu para entrega";
    case "DELIVERED":
      return "Entregue";
    case "CANCELED":
      return "Cancelado";
    default:
      return s;
  }
}

/* =========================
   COMPONENT
   ========================= */

export default function OrderTrackingPage({
  params,
}: {
  params: { orderId: string };
}) {
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://cardapiopro-backend.onrender.com";

  const orderId = params.orderId;

  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<OrderStatus | null>(null);

  /* =========================
     FETCH
     ========================= */

  async function fetchOrder(showLoader = false) {
    try {
      if (showLoader) setLoading(true);

      const res = await fetch(`${API_URL}/public/orders/${orderId}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Pedido ainda não disponível.");
        }
        throw new Error(`Erro ${res.status}`);
      }

      const data: PublicOrder = await res.json();

      // 🔥 força update apenas se algo mudou
      if (lastStatusRef.current !== data.status) {
        lastStatusRef.current = data.status;
        setOrder(data);
      } else {
        setOrder((prev) => prev ?? data);
      }

      setError(null);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar pedido");
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     EFFECT
     ========================= */

  useEffect(() => {
    // primeira tentativa
    fetchOrder(true);

    // polling real
    pollingRef.current = setInterval(() => {
      fetchOrder(false);
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /* =========================
     MEMOS
     ========================= */

  const totalItems = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((acc, it) => acc + it.quantity, 0);
  }, [order]);

  const waPhone = useMemo(() => {
    if (!order?.restaurant.phone) return null;
    return sanitizePhoneForWhatsApp(order.restaurant.phone);
  }, [order]);

  /* =========================
     STATES
     ========================= */

  if (loading && !order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Processando pedido…</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Aguarde alguns segundos. Seu pedido está sendo registrado.
          </p>
        </div>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Aguardando pedido</h1>
          <p className="text-sm text-zinc-600 mt-2">{error}</p>

          <button
            onClick={() => fetchOrder(true)}
            className="mt-4 rounded-2xl px-4 py-3 text-sm font-bold bg-black text-white"
          >
            Atualizar
          </button>
        </div>
      </main>
    );
  }

  if (!order) return null;

  /* =========================
     RENDER
     ========================= */

  return (
    <main className="min-h-screen bg-zinc-100 pb-10">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex justify-between items-start">
          <div>
            <h1 className="text-lg font-bold">Acompanhar pedido</h1>
            <p className="text-sm text-zinc-600">{order.restaurant.name}</p>
            <p className="text-xs text-zinc-500">
              Pedido #{order.id.slice(0, 8)}
            </p>
          </div>

          <button
            onClick={() => fetchOrder(true)}
            className="rounded-xl px-4 py-2 text-sm font-bold border bg-white"
          >
            Atualizar
          </button>
        </div>
      </header>

      {waPhone ? (
        <a
          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
            `Olá! Meu pedido é ${order.id}.`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-6 right-4 z-50 rounded-full px-4 py-3 bg-green-600 text-white font-bold shadow-lg"
        >
          WhatsApp
        </a>
      ) : null}

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <section className="rounded-2xl border bg-white p-4">
          <h2 className="text-lg font-bold mb-2">Status</h2>
          <p className="text-sm font-semibold">
            {statusLabel(order.status)}
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            Atualização automática a cada 5 segundos.
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <h2 className="text-lg font-bold">Resumo</h2>

          <div className="mt-3 flex justify-between text-sm">
            <span>Itens</span>
            <span className="font-bold">{totalItems}</span>
          </div>

          <div className="mt-2 flex justify-between text-sm">
            <span>Total</span>
            <span className="font-bold">{formatBRL(order.totalCents)}</span>
          </div>

          <div className="mt-4 border-t pt-3 space-y-2">
            {order.items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span>
                  {it.quantity}× {it.nameSnapshot}
                </span>
                <span className="font-semibold">
                  {formatBRL(it.unitPriceCents * it.quantity)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

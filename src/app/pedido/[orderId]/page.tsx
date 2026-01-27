"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

function statusLabel(s: OrderStatus) {
  switch (s) {
    case "NEW":
      return "Pedido recebido";
    case "PREPARING":
      return "Preparando pedido";
    case "OUT_FOR_DELIVERY":
      return "Saiu para entrega";
    case "DELIVERED":
      return "Pedido entregue";
    case "CANCELED":
      return "Pedido cancelado";
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
  const router = useRouter();

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://cardapiopro-backend.onrender.com";

  const orderId = params.orderId;

  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [manualLoading, setManualLoading] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  /* =========================
     FETCH
     ========================= */

  async function fetchOrder(showLoader = false) {
    try {
      if (showLoader) setManualLoading(true);

      const res = await fetch(`${API_URL}/public/orders/${orderId}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Pedido não encontrado");
      }

      const data: PublicOrder = await res.json();
      setOrder(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Erro ao buscar pedido");
    } finally {
      setLoading(false);
      setManualLoading(false);
    }
  }

  function startPolling() {
    stopPolling();
    pollingRef.current = setInterval(() => {
      setAttempt((a) => a + 1);
      fetchOrder(false);
    }, 8000);
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function forceRefresh() {
    stopPolling();
    setAttempt((a) => a + 1);
    fetchOrder(true);
    startPolling();
  }

  /* =========================
     EFFECTS
     ========================= */

  useEffect(() => {
    fetchOrder(false);
    startPolling();

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /* =========================
     MEMOS
     ========================= */

  const totalItems = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((acc, it) => acc + it.quantity, 0);
  }, [order]);

  /* =========================
     STATES
     ========================= */

  if (loading && !order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Aguardando pedido</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Seu pedido está sendo registrado...
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
          <p className="text-sm text-red-600 mt-2">{error}</p>

          <button
            onClick={forceRefresh}
            className="mt-4 rounded-xl px-4 py-3 bg-black text-white font-bold"
          >
            Atualizar agora
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
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-xl font-bold">
            Pedido #{order.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-zinc-700">
            Status: <strong>{statusLabel(order.status)}</strong>
          </p>
        </header>

        {/* Items */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3">Itens</h2>

          <div className="space-y-2">
            {order.items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {it.quantity}× {it.nameSnapshot}
                </span>
                <span>
                  {formatBRL(it.unitPriceCents * it.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t mt-3 pt-3 flex items-center justify-between">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-lg">
              {formatBRL(order.totalCents)}
            </span>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={forceRefresh}
            disabled={manualLoading}
            className="rounded-xl px-4 py-3 bg-black text-white font-bold disabled:opacity-50"
          >
            {manualLoading ? "Atualizando..." : "Atualizar agora"}
          </button>

          <button
            onClick={() => router.push(`/m/${order.restaurant.id}`)}
            className="rounded-xl px-4 py-3 border bg-white font-bold"
          >
            Voltar ao cardápio
          </button>

          <p className="text-xs text-zinc-500 text-center">
            Tentativa {attempt}. Atualizamos automaticamente.
          </p>
        </div>
      </div>
    </main>
  );
}

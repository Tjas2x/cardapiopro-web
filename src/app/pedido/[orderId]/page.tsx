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

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  /* =========================
     FETCH (VERSÃO QUE FUNCIONAVA)
     ========================= */

  async function fetchOrder() {
    try {
      const res = await fetch(`${API_URL}/public/orders/${orderId}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        return; // ← comportamento antigo: não trava, continua tentando
      }

      const data: PublicOrder = await res.json();
      setOrder(data);
      setError(null);
    } catch {
      // silencioso (como antes)
    } finally {
      setLoading(false);
    }
  }

  function startPolling() {
    stopPolling();
    pollingRef.current = setInterval(() => {
      setAttempt((a) => a + 1);
      fetchOrder();
    }, 8000);
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  /* =========================
     EFFECT
     ========================= */

  useEffect(() => {
    fetchOrder();
    startPolling();

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /* =========================
     STATES
     ========================= */

  if (loading && !order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Aguardando pedido</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Tentativa {attempt}. Atualizamos automaticamente.
          </p>

          <button
            onClick={fetchOrder}
            className="mt-4 rounded-xl px-4 py-3 bg-black text-white font-bold"
          >
            Atualizar agora
          </button>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Aguardando pedido</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Tentativa {attempt}. Atualizamos automaticamente.
          </p>

          <button
            onClick={fetchOrder}
            className="mt-4 rounded-xl px-4 py-3 bg-black text-white font-bold"
          >
            Atualizar agora
          </button>
        </div>
      </main>
    );
  }

  /* =========================
     RENDER
     ========================= */

  return (
    <main className="min-h-screen bg-zinc-100 pb-10">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-xl font-bold">
            Pedido #{order.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-zinc-700">
            Status: <strong>{statusLabel(order.status)}</strong>
          </p>
        </header>

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

        <div className="flex flex-col gap-3">
          <button
            onClick={fetchOrder}
            className="rounded-xl px-4 py-3 bg-black text-white font-bold"
          >
            Atualizar agora
          </button>

          <button
            onClick={() => router.push(`/m/${order.restaurant.id}`)}
            className="rounded-xl px-4 py-3 border bg-white font-bold"
          >
            Voltar ao cardápio
          </button>

          <p className="text-xs text-zinc-500 text-center">
            Atualização automática a cada 8 segundos
          </p>
        </div>
      </div>
    </main>
  );
}

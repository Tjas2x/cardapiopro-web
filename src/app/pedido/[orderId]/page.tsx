"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

/* =========================
   TYPES
   ========================= */

type OrderStatus =
  | "NEW"
  | "PREPARING"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELED";

type Order = {
  id: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  restaurant: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  };
  items: {
    id: string;
    quantity: number;
    unitPriceCents: number;
    nameSnapshot: string;
  }[];
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

function statusLabel(status: OrderStatus) {
  switch (status) {
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
      return status;
  }
}

/* =========================
   COMPONENT
   ========================= */

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://cardapiopro-backend.onrender.com";

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /* =========================
     POLLING CONTROL
     ========================= */

  function stopPolling() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleNext() {
    stopPolling();
    timerRef.current = setTimeout(fetchOrder, 4000);
  }

  /* =========================
     FETCH ORDER
     ========================= */

  async function fetchOrder() {
    try {
      const res = await fetch(`${API_URL}/public/orders/${orderId}`, {
        cache: "no-store",
      });

      // pedido ainda não indexado
      if (res.status === 404) {
        setAttempt((a) => a + 1);
        setLoading(false);
        scheduleNext();
        return;
      }

      if (!res.ok) {
        throw new Error(`Erro ${res.status}`);
      }

      const data: Order = await res.json();

      setOrder(data);
      setLoading(false);
      setError(null);

      // status final → para polling
      if (data.status === "DELIVERED" || data.status === "CANCELED") {
        stopPolling();
        return;
      }

      scheduleNext();
    } catch (err: any) {
      setError(err?.message || "Erro ao buscar pedido");
      setLoading(false);
      scheduleNext();
    }
  }

  /* =========================
     MANUAL REFRESH
     ========================= */

  function manualRefresh() {
    stopPolling();
    setError(null);
    setLoading(true);
    setAttempt((a) => a + 1);
    fetchOrder();
  }

  /* =========================
     EFFECT
     ========================= */

  useEffect(() => {
    fetchOrder();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /* =========================
     STATES
     ========================= */

  if (loading && !order) {
    return (
      <main className="min-h-screen p-6">
        <h1 className="text-xl font-bold">Aguardando pedido</h1>
        <p className="text-sm text-zinc-600 mt-2">
          Tentativa {attempt}. Atualizamos automaticamente.
        </p>

        <button
          type="button"
          onClick={manualRefresh}
          className="mt-4 rounded-xl px-4 py-2 bg-black text-white font-bold"
        >
          Atualizar agora
        </button>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className="min-h-screen p-6">
        <h1 className="text-xl font-bold">Erro ao carregar pedido</h1>
        <p className="text-sm text-red-600 mt-2">{error}</p>

        <button
          type="button"
          onClick={manualRefresh}
          className="mt-4 rounded-xl px-4 py-2 bg-black text-white font-bold"
        >
          Tentar novamente
        </button>
      </main>
    );
  }

  if (!order) return null;

  /* =========================
     RENDER ORDER
     ========================= */

  return (
    <main className="min-h-screen bg-zinc-100 p-6 space-y-4">
      <h1 className="text-xl font-bold">
        Pedido #{order.id.slice(0, 8)}
      </h1>

      <p className="text-sm">
        Status:{" "}
        <span className="font-bold">
          {statusLabel(order.status)}
        </span>
      </p>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-bold mb-2">Itens</h2>

        {order.items.map((i) => (
          <div
            key={i.id}
            className="flex justify-between text-sm py-1"
          >
            <span>
              {i.quantity}× {i.nameSnapshot}
            </span>
            <span>
              {formatBRL(i.unitPriceCents * i.quantity)}
            </span>
          </div>
        ))}

        <div className="border-t mt-2 pt-2 flex justify-between font-bold">
          <span>Total</span>
          <span>{formatBRL(order.totalCents)}</span>
        </div>
      </section>

      {(order.status !== "DELIVERED" &&
        order.status !== "CANCELED") && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={manualRefresh}
            className="w-full rounded-xl px-4 py-3 bg-black text-white font-bold"
          >
            Atualizar agora
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = `/m/${order.restaurant.id}`;
            }}
            className="w-full rounded-xl px-4 py-3 border bg-white font-bold"
          >
            Voltar ao cardápio
          </button>
        </div>
      )}
    </main>
  );
}

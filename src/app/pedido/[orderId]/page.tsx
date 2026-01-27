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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const startedAtRef = useRef(Date.now());

  const MAX_WAIT_MS = 2 * 60 * 1000; // 2 minutos
  const POLL_INTERVAL = 5000;

  /* =========================
     FETCH (RESILIENTE)
     ========================= */

  async function fetchOrder(silent = false) {
    try {
      if (!silent) setLoading(true);

      const res = await fetch(`${API_URL}/public/orders/${orderId}`, {
        cache: "no-store",
      });

      // 🔁 404 = pedido ainda sendo criado (estado transitório)
      if (res.status === 404) {
        setAttempts((a) => a + 1);
        setErrorMsg(null);
        return;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Erro ${res.status}: ${txt}`);
      }

      const data: PublicOrder = await res.json();
      setOrder(data);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err?.message || "Falha ao carregar pedido.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  /* =========================
     EFFECTS
     ========================= */

  useEffect(() => {
    fetchOrder(false);

    pollingRef.current = setInterval(() => {
      fetchOrder(true);
    }, POLL_INTERVAL);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const timedOut = useMemo(() => {
    return Date.now() - startedAtRef.current > MAX_WAIT_MS;
  }, [attempts]);

  const waPhone = useMemo(() => {
    if (!order?.restaurant?.phone) return null;
    return sanitizePhoneForWhatsApp(order.restaurant.phone);
  }, [order]);

  /* =========================
     RENDER STATES
     ========================= */

  if (loading && !order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Pedido sendo processado…</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Aguarde alguns segundos. Isso pode levar um instante.
          </p>
        </div>
      </main>
    );
  }

  if (!order && timedOut) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Ainda estamos processando</h1>
          <p className="text-sm text-zinc-700 mt-2">
            Seu pedido foi enviado, mas está demorando mais que o normal.
          </p>

          <button
            type="button"
            onClick={() => fetchOrder(false)}
            className="mt-4 rounded-2xl px-4 py-3 text-sm font-bold bg-black text-white"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Pedido sendo criado…</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Tentativa {attempts + 1}. Atualizamos automaticamente.
          </p>
        </div>
      </main>
    );
  }

  /* =========================
     MAIN RENDER
     ========================= */

  return (
    <main className="min-h-screen bg-zinc-100 pb-10">
      {/* HEADER (ajustamos depois) */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <h1 className="text-lg font-bold">Acompanhar pedido</h1>
          <p className="text-sm text-zinc-600">{order.restaurant.name}</p>
        </div>
      </header>

      {/* WhatsApp */}
      {waPhone && (
        <a
          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
            `Olá! Meu pedido é ${order.id}.`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-6 right-4 rounded-full px-4 py-3 bg-green-600 text-white font-bold shadow-lg"
        >
          WhatsApp
        </a>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-2">Status</h2>
          <p className="text-sm font-semibold">
            {statusLabel(order.status)}
          </p>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">Resumo</h2>

          <div className="mt-2 flex justify-between text-sm">
            <span>Itens</span>
            <span>{order.items.length}</span>
          </div>

          <div className="mt-2 flex justify-between font-bold">
            <span>Total</span>
            <span>{formatBRL(order.totalCents)}</span>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">Entrega</h2>

          <p className="text-sm mt-1">
            <strong>Endereço:</strong>{" "}
            {order.deliveryAddress || "Não informado"}
          </p>
        </section>
      </div>
    </main>
  );
}

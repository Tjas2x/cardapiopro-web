"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function sanitizePhoneForWhatsApp(phone: string) {
  const d = onlyDigits(phone);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  return `55${d}`;
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function paymentLabel(pm: PaymentMethod) {
  switch (pm) {
    case "PIX":
      return "PIX";
    case "CARD_CREDIT":
      return "Cartão (Crédito na entrega)";
    case "CARD_DEBIT":
      return "Cartão (Débito na entrega)";
    case "CASH":
      return "Dinheiro";
    default:
      return pm;
  }
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

function stepIndex(s: OrderStatus) {
  if (s === "NEW") return 0;
  if (s === "PREPARING") return 1;
  if (s === "OUT_FOR_DELIVERY") return 2;
  if (s === "DELIVERED") return 3;
  if (s === "CANCELED") return -1;
  return 0;
}

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
  const [err, setErr] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchOrder(silent = false) {
    try {
      if (!silent) {
        setLoading(true);
      }

      const r = await fetch(`${API_URL}/public/orders/${orderId}`, {
        cache: "no-store",
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Erro (${r.status}). ${txt}`);
      }

      const data: PublicOrder = await r.json();

      setOrder(data);
      setErr(null);
    } catch (e: any) {
      // ✅ não derruba a tela se já tinha pedido carregado
      setErr((prev) => prev || (e?.message || "Falha ao carregar pedido."));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrder(false);

    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(() => {
      fetchOrder(true);
    }, 10000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const totalItems = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((acc, it) => acc + it.quantity, 0);
  }, [order]);

  const step = useMemo(() => (order ? stepIndex(order.status) : 0), [order]);

  const waPhone = useMemo(() => {
    if (!order?.restaurant?.phone) return null;
    return sanitizePhoneForWhatsApp(order.restaurant.phone);
  }, [order]);

  if (loading && !order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Carregando pedido...</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Aguarde só um instante.
          </p>
        </div>
      </main>
    );
  }

  // ✅ se deu erro mas já tem order carregado, mostra aviso mas não trava
  if (err && !order) {
    return (
      <main className="min-h-screen bg-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-bold">Não foi possível carregar</h1>
          <p className="text-sm text-zinc-700 mt-2">{err}</p>

          <button
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
          <h1 className="text-xl font-bold">Pedido não encontrado</h1>
          <p className="text-sm text-zinc-600 mt-2">
            Se você acabou de finalizar, aguarde alguns segundos e tente atualizar.
          </p>

          <button
            onClick={() => fetchOrder(false)}
            className="mt-4 rounded-2xl px-4 py-3 text-sm font-bold bg-black text-white"
          >
            Atualizar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 pb-10">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">Acompanhar pedido</h1>
              <p className="text-sm text-zinc-600 mt-1 truncate">
                {order.restaurant.name}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Pedido: <span className="font-mono">{order.id}</span>
              </p>

              {err ? (
                <p className="text-xs text-red-600 mt-2 font-semibold">
                  Atenção: {err}
                </p>
              ) : null}
            </div>

            <button
              onClick={() => fetchOrder(false)}
              className="shrink-0 rounded-2xl px-4 py-3 text-sm font-bold border bg-white"
            >
              Atualizar
            </button>
          </div>
        </div>
      </header>

      {waPhone ? (
        <a
          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
            `Olá! Vim pelo cardápio. Meu pedido é ${order.id}.`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-6 right-4 z-[55] rounded-full px-4 py-3 bg-green-600 text-white font-bold shadow-lg"
        >
          WhatsApp
        </a>
      ) : null}

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Status</h2>

            <span
              className={`text-xs px-3 py-1 rounded-full font-bold ${
                order.status === "DELIVERED"
                  ? "bg-green-100 text-green-700"
                  : order.status === "CANCELED"
                  ? "bg-red-100 text-red-700"
                  : "bg-zinc-100 text-zinc-700"
              }`}
            >
              {statusLabel(order.status)}
            </span>
          </div>

          {order.status !== "CANCELED" ? (
            <div className="mt-4 space-y-3">
              {["Recebido", "Em preparo", "Saiu para entrega", "Entregue"].map(
                (label, idx) => {
                  const active = step >= idx;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          active ? "bg-black" : "bg-zinc-300"
                        }`}
                      />
                      <p
                        className={`text-sm font-semibold ${
                          active ? "text-zinc-900" : "text-zinc-500"
                        }`}
                      >
                        {label}
                      </p>
                    </div>
                  );
                }
              )}
              <p className="text-xs text-zinc-500 mt-2">
                A página atualiza automaticamente a cada 10 segundos.
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-600 mt-3 font-semibold">
              Esse pedido foi cancelado.
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">Pagamento</h2>

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-600">Forma</p>
              <p className="text-sm font-bold text-zinc-900">
                {paymentLabel(order.paymentMethod)}
              </p>
            </div>

            {order.paymentMethod === "CASH" ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-600">Troco</p>
                <p className="text-sm font-bold text-zinc-900">
                  {order.cashChangeForCents
                    ? `Troco para ${formatBRL(order.cashChangeForCents)}`
                    : "Não precisa"}
                </p>
              </div>
            ) : null}

            {order.paymentMethod === "PIX" ? (
              <p className="text-xs text-zinc-500 mt-1">
                Se precisar, finalize o pagamento combinando via WhatsApp.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">Resumo</h2>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-zinc-600">Itens</p>
            <p className="text-sm font-bold text-zinc-900">{totalItems}</p>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-zinc-600">Total</p>
            <p className="text-lg font-bold text-zinc-900">
              {formatBRL(order.totalCents)}
            </p>
          </div>

          <div className="mt-4 border-t pt-3 space-y-2">
            {order.items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {it.nameSnapshot}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {it.quantity} × {formatBRL(it.unitPriceCents)}
                  </p>
                </div>

                <p className="text-sm font-bold text-zinc-900">
                  {formatBRL(it.unitPriceCents * it.quantity)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">Entrega</h2>

          <div className="mt-3 space-y-2">
            {order.customerName ? (
              <p className="text-sm text-zinc-800">
                <span className="font-bold">Cliente:</span> {order.customerName}
              </p>
            ) : null}

            {order.customerPhone ? (
              <p className="text-sm text-zinc-800">
                <span className="font-bold">Telefone:</span> {order.customerPhone}
              </p>
            ) : null}

            <p className="text-sm text-zinc-800">
              <span className="font-bold">Endereço:</span>{" "}
              {order.deliveryAddress || "Não informado"}
            </p>

            {order.restaurant.address ? (
              <p className="text-xs text-zinc-500">
                Endereço do restaurante: {order.restaurant.address}
              </p>
            ) : null}
          </div>
        </section>

        <div className="text-xs text-zinc-500 text-center pt-2">
          Cardápio Online • Pedido #{order.id.slice(0, 8)}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

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
  paymentMethod: string;
  restaurant: {
    name: string;
    phone: string | null;
    address: string | null;
  };
  items: {
    id: string;
    nameSnapshot: string;
    quantity: number;
    unitPriceCents: number;
  }[];
};

export default function PedidoPage({
  params,
}: {
  params: { orderId: string };
}) {
  const { orderId } = params;

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    "https://cardapiopro-backend.onrender.com";

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchOrder() {
    try {
      const res = await fetch(`${API_URL}/public/orders/${orderId}`, {
        cache: "no-store",
      });

      if (res.status === 404) {
        // pedido ainda não persistido → NÃO é erro fatal
        setAttempt((a) => a + 1);
        return;
      }

      if (!res.ok) {
        throw new Error("Falha ao buscar pedido");
      }

      const data = (await res.json()) as Order;

      // 🔥 SUCESSO: limpa erro e atualiza pedido
      setError(null);
      setOrder(data);

      // se chegou ao fim, para polling
      if (data.status === "DELIVERED" || data.status === "CANCELED") {
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    } catch (err: any) {
      // ⚠️ erro de rede NÃO trava o polling
      setError("Erro de rede. Tentando novamente...");
      setAttempt((a) => a + 1);
    }
  }

  useEffect(() => {
    fetchOrder();

    pollingRef.current = setInterval(fetchOrder, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  return (
    <main className="min-h-screen bg-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {!order ? (
          <>
            <h1 className="text-xl font-bold">Aguardando pedido</h1>
            <p className="text-sm text-zinc-600 mt-2">
              Tentativa {attempt}. Atualizamos automaticamente.
            </p>

            {error ? (
              <p className="text-sm text-red-600 mt-3">{error}</p>
            ) : null}

            <button
              onClick={fetchOrder}
              className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold bg-black text-white"
            >
              Atualizar agora
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Pedido #{order.id}</h1>

            <p className="mt-2 text-sm">
              Status:{" "}
              <span className="font-bold text-green-700">
                {order.status}
              </span>
            </p>

            <div className="mt-6 rounded-xl bg-white p-4 border">
              <h2 className="font-bold mb-2">Itens</h2>
              <ul className="space-y-1 text-sm">
                {order.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity}× {i.nameSnapshot}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 text-sm text-zinc-600">
              Restaurante: {order.restaurant.name}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

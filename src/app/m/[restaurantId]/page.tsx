"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function MenuPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = params?.restaurantId;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loadingRestaurant, setLoadingRestaurant] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [cart, setCart] = useState<CartItem[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // ✅ Debug na tela (pra não depender de console)
  const [debugRestaurant, setDebugRestaurant] = useState<string>("");
  const [debugProducts, setDebugProducts] = useState<string>("");

  // ✅ Buscar restaurante
  useEffect(() => {
    if (!restaurantId) return;

    let active = true;

    async function loadRestaurant() {
      try {
        setLoadingRestaurant(true);

        const url = `${API_URL}/restaurants/${restaurantId}`;

        const res = await fetch(url);
        const text = await res.text();

        setDebugRestaurant(
          `GET ${url}\nSTATUS ${res.status}\nBODY ${text.slice(0, 300)}`
        );

        if (!active) return;

        if (!res.ok) {
          setRestaurant(null);
          return;
        }

        const data = safeJsonParse(text);
        setRestaurant(data);
      } catch (e: any) {
        setDebugRestaurant(`ERROR: ${e?.message || String(e)}`);
        if (!active) return;
        setRestaurant(null);
      } finally {
        if (!active) return;
        setLoadingRestaurant(false);
      }
    }

    loadRestaurant();
    return () => {
      active = false;
    };
  }, [API_URL, restaurantId]);

  // ✅ Buscar produtos
  useEffect(() => {
    if (!restaurantId) return;

    let active = true;

    async function loadProducts() {
      try {
        setLoadingProducts(true);

        const url = `${API_URL}/restaurants/${restaurantId}/products`;

        const res = await fetch(url);
        const text = await res.text();

        setDebugProducts(
          `GET ${url}\nSTATUS ${res.status}\nBODY ${text.slice(0, 300)}`
        );

        if (!active) return;

        if (!res.ok) {
          setProducts([]);
          return;
        }

        const data = safeJsonParse(text);
        setProducts(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setDebugProducts(`ERROR: ${e?.message || String(e)}`);
        if (!active) return;
        setProducts([]);
      } finally {
        if (!active) return;
        setLoadingProducts(false);
      }
    }

    loadProducts();
    return () => {
      active = false;
    };
  }, [API_URL, restaurantId]);

  const totalCents = useMemo(() => {
    return cart.reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0);
  }, [cart]);

  const totalItems = useMemo(() => {
    return cart.reduce((acc, i) => acc + i.quantity, 0);
  }, [cart]);

  function addProduct(p: Product) {
    setResultMsg(null);
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.productId === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unitPriceCents: p.priceCents,
          quantity: 1,
        },
      ];
    });
  }

  function removeProduct(productId: string) {
    setResultMsg(null);
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.productId === productId);
      if (idx < 0) return prev;

      const item = prev[idx];
      if (item.quantity <= 1) {
        return prev.filter((x) => x.productId !== productId);
      }

      const copy = [...prev];
      copy[idx] = { ...copy[idx], quantity: copy[idx].quantity - 1 };
      return copy;
    });
  }

  async function finalizeOrder() {
    setResultMsg(null);

    if (!restaurantId) {
      setResultMsg("Restaurante inválido.");
      return;
    }

    if (!customerName.trim()) {
      setResultMsg("Informe seu nome.");
      return;
    }
    if (!customerPhone.trim()) {
      setResultMsg("Informe seu telefone.");
      return;
    }
    if (!deliveryAddress.trim()) {
      setResultMsg("Informe o endereço.");
      return;
    }
    if (cart.length === 0) {
      setResultMsg("Carrinho vazio.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        restaurantId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: deliveryAddress.trim(),
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      };

      const url = `${API_URL}/public/orders`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const data = safeJsonParse(text);

      if (!res.ok) {
        setResultMsg((data as any)?.error || "Erro ao finalizar pedido.");
        return;
      }

      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDeliveryAddress("");
      setResultMsg(`Pedido enviado ✅ Nº ${(data as any)?.id || "OK"}`);
    } catch (e) {
      setResultMsg("Erro de conexão ao enviar pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">
                {loadingRestaurant
                  ? "Carregando..."
                  : restaurant?.name || "Cardápio"}
              </h1>

              <p className="text-sm text-zinc-600 mt-1">
                {loadingRestaurant
                  ? "Carregando restaurante..."
                  : restaurant?.description || "Faça seu pedido abaixo 👇"}
              </p>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {restaurant ? (
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      restaurant.isOpen
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {restaurant.isOpen ? "Aberto" : "Fechado"}
                  </span>
                ) : null}

                {restaurant?.address ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700">
                    📍 {restaurant.address}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 rounded-full bg-black text-white text-xs px-3 py-1 font-semibold">
              {totalItems} item(ns)
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6 pb-32">
        {/* DEBUG NA TELA */}
        <section className="rounded-2xl border bg-white p-4 text-xs text-zinc-700 whitespace-pre-wrap">
          <div className="font-bold">DEBUG</div>
          <div>
            <b>restaurantId:</b> {String(restaurantId)}
          </div>
          <div>
            <b>API_URL:</b> {API_URL}
          </div>
          <div>
            <b>products.length:</b> {products.length}
          </div>
          <div>
            <b>loadingProducts:</b> {String(loadingProducts)}
          </div>

          <div className="mt-3">
            <b>Restaurant fetch:</b>
            <div>{debugRestaurant || "(vazio)"}</div>
          </div>

          <div className="mt-3">
            <b>Products fetch:</b>
            <div>{debugProducts || "(vazio)"}</div>
          </div>
        </section>

        {/* Produtos */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Produtos</h2>
            {loadingProducts ? (
              <span className="text-sm text-zinc-500">Carregando...</span>
            ) : null}
          </div>

          {!restaurantId ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
              Carregando loja...
            </div>
          ) : products.length === 0 && !loadingProducts ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {products.map((p) => {
                const cartItem = cart.find((x) => x.productId === p.id);
                const qty = cartItem?.quantity ?? 0;

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-zinc-900 truncate">
                          {p.name}
                        </h3>

                        {p.description ? (
                          <p className="text-sm text-zinc-600 mt-1 leading-snug">
                            {p.description}
                          </p>
                        ) : null}

                        <p className="mt-2 text-sm font-bold text-zinc-900">
                          {formatBRL(p.priceCents)}
                        </p>

                        {qty > 0 ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            No carrinho:{" "}
                            <span className="font-semibold">{qty}</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <button
                          onClick={() => addProduct(p)}
                          disabled={!p.active}
                          className="rounded-xl px-4 py-2 text-sm font-semibold bg-black text-white disabled:bg-zinc-300"
                        >
                          Adicionar
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => removeProduct(p.id)}
                            disabled={!p.active || qty === 0}
                            className="h-9 w-9 rounded-xl border font-bold disabled:opacity-40"
                          >
                            –
                          </button>

                          <div className="w-8 text-center font-semibold">
                            {qty}
                          </div>

                          <button
                            onClick={() => addProduct(p)}
                            disabled={!p.active}
                            className="h-9 w-9 rounded-xl border font-bold disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Checkout */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-bold">Seus dados</h2>

          <div className="grid grid-cols-1 gap-3">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Seu nome"
              className="border rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-black"
            />

            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Telefone (WhatsApp)"
              className="border rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-black"
            />

            <input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Endereço para entrega"
              className="border rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {resultMsg ? (
            <div className="text-sm text-zinc-700 bg-zinc-100 border rounded-xl p-3">
              {resultMsg}
            </div>
          ) : null}

          <button
            onClick={finalizeOrder}
            disabled={submitting || !restaurantId}
            className="w-full rounded-xl px-4 py-3 font-semibold bg-black text-white disabled:bg-zinc-300"
          >
            {submitting ? "Enviando..." : "Finalizar pedido"}
          </button>

          <p className="text-xs text-zinc-500">
            Ao finalizar, seu pedido será enviado direto para o restaurante.
          </p>
        </section>
      </main>

      {/* Barra inferior */}
      <footer className="fixed bottom-0 left-0 right-0 border-t bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-500">Total</div>
            <div className="text-lg font-bold">{formatBRL(totalCents)}</div>
          </div>

          <button
            onClick={() => setCart([])}
            className="rounded-xl px-4 py-2 border font-semibold"
          >
            Limpar carrinho
          </button>
        </div>
      </footer>
    </div>
  );
}

// DEBUG-MARK: 2026-01-19 08:08:10

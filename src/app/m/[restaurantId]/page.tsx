import { notFound } from "next/navigation";

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

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type Props = {
  params: { restaurantId: string };
};

export default async function MenuPage({ params }: Props) {
  const restaurantId = params?.restaurantId;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  if (!restaurantId) notFound();

  const restaurantRes = await fetch(`${API_URL}/restaurants/${restaurantId}`, {
    cache: "no-store",
  });

  if (!restaurantRes.ok) {
    notFound();
  }

  const restaurant: Restaurant = await restaurantRes.json();

  const productsRes = await fetch(
    `${API_URL}/restaurants/${restaurantId}/products`,
    { cache: "no-store" }
  );

  const products: Product[] = productsRes.ok ? await productsRes.json() : [];

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">
                {restaurant?.name || "Cardápio"}
              </h1>

              <p className="text-sm text-zinc-600 mt-1">
                {restaurant?.description || "Faça seu pedido abaixo 👇"}
              </p>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-1 rounded-full font-semibold ${
                    restaurant.isOpen
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {restaurant.isOpen ? "Aberto" : "Fechado"}
                </span>

                {restaurant?.address ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700">
                    📍 {restaurant.address}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 rounded-full bg-black text-white text-xs px-3 py-1 font-semibold">
              {products?.length || 0} produto(s)
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6 pb-32">
        {/* Produtos */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Produtos</h2>
          </div>

          {products.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {products.map((p) => (
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

                      {!p.active ? (
                        <p className="mt-1 text-xs text-zinc-500">Indisponível</p>
                      ) : null}
                    </div>

                    <button
                      disabled
                      className="rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-200 text-zinc-500 cursor-not-allowed"
                      title="Checkout será ativado depois"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Checkout (placeholder) */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-bold">Seus dados</h2>

          <div className="rounded-xl bg-zinc-100 border p-3 text-sm text-zinc-600">
            Checkout será ativado em seguida (quando conectarmos pedidos + carrinho no client).
          </div>
        </section>
      </main>
    </div>
  );
}

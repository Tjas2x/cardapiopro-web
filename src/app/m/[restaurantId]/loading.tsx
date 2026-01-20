export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <h1 className="text-xl font-bold">Carregando cardápio...</h1>
          <p className="text-sm text-zinc-600 mt-1">
            Carregando restaurante e produtos...
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-3">
        <div className="rounded-2xl border bg-white p-4">Carregando...</div>
        <div className="rounded-2xl border bg-white p-4">Carregando...</div>
        <div className="rounded-2xl border bg-white p-4">Carregando...</div>
      </main>
    </div>
  );
}

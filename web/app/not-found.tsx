import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap max-w-3xl py-16">
      <span className="eyebrow">Error 404</span>
      <h1 className="page-title mt-2 mb-4">Esta página se ha quedado dormida</h1>
      <p className="mb-6 text-muted">No encontramos lo que buscas. Quizá te interese alguno de nuestros colchones.</p>
      <Link href="/" className="btn btn-primary">
        Volver al inicio
      </Link>
    </div>
  );
}

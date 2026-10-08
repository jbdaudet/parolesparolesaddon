import { ArrowLeft, Search } from 'lucide-react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router';
import { DebateHome } from './debate/DebateHome';
import { DebatePage } from './debate/DebatePage';

/**
 * Coquille de démonstration autonome. Lors de la fusion, seules les deux routes
 * sont à reprendre dans le routeur du site (voir docs/INTEGRATION.md).
 */
export function App() {
  return (
    <BrowserRouter>
      {/* En-tête recopié du site (mêmes classes) ; l'onglet « Vidéos » est l'ajout du module. */}
      <div className="flex min-h-screen flex-col bg-[#F5F5F7] font-sans text-slate-900 selection:bg-blue-200 selection:text-blue-900">
        <header className="border-b border-slate-200/60 bg-white">
          <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8 xl:px-12">
            <div className="flex items-center gap-6">
              <Link to="/" className="group flex cursor-pointer items-center gap-3">
                <span className="rounded-xl bg-blue-600 p-2 shadow-sm transition-transform group-hover:scale-105">
                  <Search className="h-5 w-5 text-white" />
                </span>
                <span>
                  <span className="block text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                    Paroles ? Paroles !
                  </span>
                  <span className="block text-xs font-medium text-slate-500">Se poser les bonnes questions</span>
                </span>
              </Link>
              <nav className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 md:flex">
                {['Analyseur', 'Le Projet'].map((label) => (
                  <span
                    key={label}
                    className="rounded-lg px-4 py-1.5 text-xs font-bold tracking-wider text-slate-400 uppercase"
                  >
                    {label}
                  </span>
                ))}
                <Link
                  to="/"
                  className="rounded-lg bg-white px-4 py-1.5 text-xs font-bold tracking-wider text-blue-600 uppercase shadow-sm"
                >
                  Vidéos
                </Link>
              </nav>
            </div>
            <span className="hidden rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 sm:inline">
              Prototype
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/video/:id" element={<DebateRoute />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function HomeRoute() {
  const navigate = useNavigate();
  return <DebateHome onOpen={(id) => navigate(`/video/${id}`)} />;
}

function DebateRoute() {
  const { id = '' } = useParams();
  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" /> Toutes les vidéos
      </Link>
      <DebatePage id={id} />
    </div>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JV Asie Travel Discovery | Luang Prabang & Bangkok',
  description: 'Objevujte nejkrásnější místa a autentické zážitky v jihovýchodní Asii napájené AI a Firestore.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className="dark">
      <body className="relative bg-slate-950 text-slate-100 min-h-screen overflow-x-hidden">
        {/* Decorative glowing background gradients */}
        <div className="fixed top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-glow" />
        <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-glow" />
        
        {children}
      </body>
    </html>
  );
}

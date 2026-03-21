import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useGameStore } from "@/hooks/use-game-store";
import { BottomNav } from "@/components/BottomNav";
import { TopBar } from "@/components/TopBar";

import { HomeView } from "@/pages/HomeView";
import { ShopView } from "@/pages/ShopView";
import { TasksView } from "@/pages/TasksView";
import { FriendsView } from "@/pages/FriendsView";
import { LuckyView } from "@/pages/LuckyView";
import { ExchangeView } from "@/pages/ExchangeView";
import { GiftcodeView } from "@/pages/GiftcodeView";
import { WithdrawView } from "@/pages/WithdrawView";
import { AdminView } from "@/pages/AdminView";
import { FlappyGameView } from "@/pages/FlappyGameView";

import otherPagesBackground from "../nen.png";
import luckyBackground from "../lucky (1).gif";

const queryClient = new QueryClient();

function GameApp() {
  const store = useGameStore();
  const currentBackground = store.currentPage === "lucky" ? luckyBackground : otherPagesBackground;
  const isGamePage = store.currentPage === "flappy";

  const renderPage = () => {
    switch (store.currentPage) {
      case "home":
        return <HomeView store={store} />;
      case "shop":
        return <ShopView store={store} />;
      case "tasks":
        return <TasksView store={store} />;
      case "friends":
        return <FriendsView store={store} />;
      case "lucky":
        return <LuckyView store={store} />;
      case "exchange":
        return <ExchangeView store={store} />;
      case "giftcode":
        return <GiftcodeView store={store} />;
      case "withdraw":
        return <WithdrawView store={store} />;
      case "admin":
        return <AdminView store={store} />;
      case "flappy":
        return <FlappyGameView store={store} />;
      default:
        return <HomeView store={store} />;
    }
  };

  return (
    <div className="relative min-h-screen w-full font-sans bg-[#120d0a] text-white selection:bg-yellow-500/30">
      {store.currentPage !== "home" && !isGamePage && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img
            src={currentBackground}
            alt="Background"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0705]/80 via-[#120d0a]/35 to-[#1a130f]/55" />
        </div>
      )}

      <div className="particles" />

      {!isGamePage && <TopBar store={store} />}

      <main
        className={`relative z-10 w-full ${
          store.currentPage === "home" || isGamePage ? "h-[100svh] overflow-hidden" : "h-full pb-24"
        }`}
      >
        {renderPage()}
      </main>

      {!isGamePage && (
        <BottomNav
          currentPage={store.currentPage}
          onChange={store.setCurrentPage}
          isAdmin={store.isAdmin}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GameApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

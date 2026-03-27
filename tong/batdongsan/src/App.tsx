import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageTrafficTracker } from "@/components/analytics/PageTrafficTracker";
import { AuthProvider } from "@/context/AuthContext";
import { SiteContactProvider } from "@/context/SiteContactContext";
import { AppEntranceSplash } from "@/components/layout/AppEntranceSplash";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BottomNav } from "@/components/layout/BottomNav";
import * as favoritesHooks from "@/hooks/useFavorites";
import { useSiteMaintenanceStatus } from "@/hooks/useSiteMaintenanceStatus";
import { Maintenance } from "@/pages/Maintenance";

const useFavoritesSyncHook = favoritesHooks.useFavoritesSync || (() => undefined);

const Home = lazy(() => import("@/pages/Home").then((module) => ({ default: module.Home })));
const Search = lazy(() => import("@/pages/Search").then((module) => ({ default: module.Search })));
const PropertyDetail = lazy(() => import("@/pages/PropertyDetail").then((module) => ({ default: module.PropertyDetail })));
const FeaturedPostDetail = lazy(() => import("@/pages/FeaturedPostDetail").then((module) => ({ default: module.FeaturedPostDetail })));
const DangTin = lazy(() => import("@/pages/DangTin").then((module) => ({ default: module.DangTin })));
const DangNhap = lazy(() => import("@/pages/DangNhap").then((module) => ({ default: module.DangNhap })));
const DangKy = lazy(() => import("@/pages/DangKy").then((module) => ({ default: module.DangKy })));
const Saved = lazy(() => import("@/pages/Saved").then((module) => ({ default: module.Saved })));
const Profile = lazy(() => import("@/pages/Profile").then((module) => ({ default: module.Profile })));
const AccountSettings = lazy(() => import("@/pages/AccountSettings").then((module) => ({ default: module.AccountSettings })));
const ChangePassword = lazy(() => import("@/pages/ChangePassword").then((module) => ({ default: module.ChangePassword })));
const Admin = lazy(() => import("@/pages/Admin").then((module) => ({ default: module.Admin })));
const AdminBichHa = lazy(() => import("@/pages/AdminBichHa").then((module) => ({ default: module.AdminBichHa })));
const OGhep = lazy(() => import("@/pages/OGhep").then((module) => ({ default: module.OGhep })));
const NotFound = lazy(() => import("@/pages/not-found").then((module) => ({ default: module.default })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function FavoritesBootstrap() {
  useFavoritesSyncHook();
  return null;
}

function RouteFallback() {
  return <div className="min-h-screen bg-muted/30" />;
}

function MaintenanceStatusFallback() {
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed,_#fff_50%,_#f7f7f4)]" />;
}

function Router() {
  const [location] = useLocation();
  const isCompactLayoutPage = [
    "/ho-so",
    "/profile",
    "/cai-dat-tai-khoan",
    "/doi-mat-khau",
    "/o-ghep",
  ].includes(location);
  const isStandalonePage = location.startsWith("/admin/bichha");
  const {
    data: maintenanceStatus,
    isLoading: isMaintenanceStatusLoading,
  } = useSiteMaintenanceStatus({ enabled: !isStandalonePage });

  const content = (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/search" component={Search} />
        <Route path="/property/:id" component={PropertyDetail} />
        <Route path="/tin-noi-bat/:id" component={FeaturedPostDetail} />
        <Route path="/dang-tin" component={DangTin} />
        <Route path="/dang-nhap" component={DangNhap} />
        <Route path="/dang-ky" component={DangKy} />
        <Route path="/saved" component={Saved} />
        <Route path="/ho-so" component={Profile} />
        <Route path="/profile" component={Profile} />
        <Route path="/cai-dat-tai-khoan" component={AccountSettings} />
        <Route path="/doi-mat-khau" component={ChangePassword} />
        <Route path="/admin/bichha" component={AdminBichHa} />
        <Route path="/admin" component={Admin} />
        <Route path="/o-ghep" component={OGhep} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );

  if (isStandalonePage) {
    return (
      <>
        <PageTrafficTracker />
        {content}
      </>
    );
  }

  if (isMaintenanceStatusLoading) {
    return <MaintenanceStatusFallback />;
  }

  if (maintenanceStatus?.isEnabled) {
    return <Maintenance status={maintenanceStatus} />;
  }

  return (
    <SiteContactProvider>
      <div className="flex flex-col min-h-screen">
        <PageTrafficTracker />
        <Navbar />
        <main className={isCompactLayoutPage ? "pb-0" : "flex-grow pb-20 lg:pb-0"}>
          {content}
        </main>
        <Footer compact={isCompactLayoutPage} />
        <BottomNav />
      </div>
    </SiteContactProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FavoritesBootstrap />
        <TooltipProvider>
          <AppEntranceSplash />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

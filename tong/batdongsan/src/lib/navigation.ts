type NavigateFn = (
  path: string,
  options?: {
    replace?: boolean;
    state?: unknown;
    transition?: boolean;
  },
) => void;

export function goBackOrNavigate(navigate: NavigateFn, fallbackPath: string) {
  if (typeof window !== "undefined" && window.history.length > 1) {
    window.history.back();
    return;
  }

  navigate(fallbackPath);
}

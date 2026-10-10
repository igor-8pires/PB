export function getLoginUrl() {
  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

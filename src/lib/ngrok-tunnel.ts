// @ngrok/ngrok is a native addon — externalized via serverExternalPackages

export async function startTunnel(token: string, port: number): Promise<{ url: string; close: () => Promise<void> }> {
  const ngrok = await import("@ngrok/ngrok");
  const listener = await (ngrok.default || ngrok).forward({
    addr: `http://127.0.0.1:${port}`,
    authtoken: token,
  });
  return { url: listener.url() ?? "", close: async () => { await listener.close(); } };
}
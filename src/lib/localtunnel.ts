import localtunnel from "localtunnel";

export type LocalTunnelHandle = {
  url: string;
  close: () => Promise<void>;
};

export async function startLocalTunnel(port: number): Promise<LocalTunnelHandle> {
  const tunnel = await localtunnel({ port });
  return {
    url: tunnel.url,
    close: async () => {
      tunnel.close();
    },
  };
}

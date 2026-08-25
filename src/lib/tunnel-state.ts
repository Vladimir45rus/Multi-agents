let tunnelActive = false;

export function setTunnelActive(active: boolean) {
  tunnelActive = active;
}

export function isTunnelActive() {
  return tunnelActive;
}

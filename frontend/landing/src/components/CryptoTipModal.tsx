import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, ArrowLeft, Check, Copy, X } from "lucide-react";
import { CRYPTO_COINS } from "./cryptoAddresses";

interface CryptoTipModalProps {
  open: boolean;
  onClose: () => void;
}

export function CryptoTipModal({ open, onClose }: CryptoTipModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const coin = selectedCoin ? CRYPTO_COINS.find((c) => c.symbol === selectedCoin) : null;
  const network = coin && selectedNetworkId
    ? coin.networks.find((n) => n.networkId === selectedNetworkId)
    : null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-card border border-border shadow-xl w-full overflow-hidden flex flex-col max-sm:h-full sm:rounded-lg sm:max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {selectedCoin && (
              <button
                onClick={() => {
                  if (selectedNetworkId) {
                    setSelectedNetworkId(null);
                  } else {
                    setSelectedCoin(null);
                  }
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-lg font-semibold">
              {network
                ? `Send ${selectedCoin} via ${network.networkName}`
                : coin
                  ? `Select a network for ${selectedCoin}`
                  : "Tip with Crypto"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedCoin && (
            /* Step 1: Coin selection */
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Select which cryptocurrency you&apos;d like to contribute, then choose the network to send it on.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Make sure the coin and network you select match what your wallet supports.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CRYPTO_COINS.map((c) => (
                  <button
                    key={c.symbol}
                    onClick={() => {
                      setSelectedCoin(c.symbol);
                      // Auto-select if only one network
                      if (c.networks.length === 1) {
                        setSelectedNetworkId(c.networks[0].networkId);
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 p-4 rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    <img src={c.logo} alt={c.symbol} className="h-8 w-8" />
                    <span className="text-sm font-semibold">{c.symbol}</span>
                    <span className="text-xs text-muted-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground/60">
                      {c.networks.length} network{c.networks.length > 1 ? "s" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedCoin && coin && !selectedNetworkId && (
            /* Step 2: Network selection */
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                Which network do you want to send <strong>{selectedCoin}</strong> on?
              </p>
              {coin.networks.map((net) => (
                <button
                  key={net.networkId}
                  onClick={() => setSelectedNetworkId(net.networkId)}
                  className="flex items-center gap-3 w-full p-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
                >
                  <img src={net.networkLogo} alt={net.networkName} className="h-5 w-5 shrink-0" />
                  <span className="font-medium text-sm">{net.networkName}</span>
                </button>
              ))}
            </div>
          )}

          {selectedCoin && coin && network && (
            /* Step 3: Address + QR */
            <AddressDisplay
              coinSymbol={selectedCoin}
              coinLogo={coin.logo}
              networkName={network.networkName}
              networkLogo={network.networkLogo}
              address={network.address}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AddressDisplay({
  coinSymbol,
  coinLogo,
  networkName,
  networkLogo,
  address,
}: {
  coinSymbol: string;
  coinLogo: string;
  networkName: string;
  networkLogo: string;
  address: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Coin + Network badge */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <img src={coinLogo} alt={coinSymbol} className="h-10 w-10" />
          <span className="text-xs font-medium">{coinSymbol}</span>
        </div>
        <span className="text-muted-foreground text-lg">on</span>
        <div className="flex flex-col items-center gap-1">
          <img src={networkLogo} alt={networkName} className="h-10 w-10" />
          <span className="text-xs font-medium">{networkName}</span>
        </div>
      </div>

      {/* Address card */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">Address</span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
        <code className="block text-sm text-center break-all text-muted-foreground bg-muted/50 px-3 py-2.5 rounded select-all">
          {address}
        </code>
        <div className="flex justify-center">
          <div className="bg-white p-2 rounded">
            <QRCodeSVG value={address} size={160} />
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-200/90">
          <strong>Double-check</strong> that you are sending <strong>{coinSymbol}</strong> on
          the <strong>{networkName}</strong> network. Sending on the wrong network may result in
          permanent loss of funds.
        </p>
      </div>
    </div>
  );
}

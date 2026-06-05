// Local SVG import for Base network
import baseLogo from "./base-logo.svg";

export interface CryptoNetworkAddress {
  networkId: string;
  networkName: string;
  networkLogo: string;
  address: string;
}

export interface CryptoCoin {
  symbol: string;
  name: string;
  logo: string;
  networks: CryptoNetworkAddress[];
}

// Logos from https://cryptologos.cc
const LOGOS = {
  BTC: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
  ETH: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
  SOL: "https://cryptologos.cc/logos/solana-sol-logo.png",
  USDC: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
  USDT: "https://cryptologos.cc/logos/tether-usdt-logo.png",
  MATIC: "https://cryptologos.cc/logos/polygon-matic-logo.png",
  ARB: "https://cryptologos.cc/logos/arbitrum-arb-logo.png",
} as const;

// Network definitions (reused across coins)
const NETWORKS = {
  bitcoin: { networkId: "bitcoin", networkName: "Bitcoin", networkLogo: LOGOS.BTC },
  ethereum: { networkId: "ethereum", networkName: "Ethereum", networkLogo: LOGOS.ETH },
  solana: { networkId: "solana", networkName: "Solana", networkLogo: LOGOS.SOL },
  base: { networkId: "base", networkName: "Base", networkLogo: baseLogo },
  polygon: { networkId: "polygon", networkName: "Polygon", networkLogo: LOGOS.MATIC },
  arbitrum: { networkId: "arbitrum", networkName: "Arbitrum", networkLogo: LOGOS.ARB },
} as const;

// Organized by coin → networks. Fill in your addresses for each.
export const CRYPTO_COINS: CryptoCoin[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    logo: LOGOS.BTC,
    networks: [
      { ...NETWORKS.bitcoin, address: "3Aju76ydL9Zrc6jTezzJ8EH1mjdmDKSSqD" },
      { ...NETWORKS.solana, address: "9XcbVJVsUrVJEdBJEVMSxg3q2TD8bxwmJ6pSx1DMYKqi" },
      { ...NETWORKS.base, address: "0xf80aFeb0bf08fd0819EAdbD4dF248F433Fa0009F" },
      { ...NETWORKS.arbitrum, address: "0xf80aFeb0bf08fd0819EAdbD4dF248F433Fa0009F" },
    ],
  },
  {
    symbol: "ETH",
    name: "Ether",
    logo: LOGOS.ETH,
    networks: [
      { ...NETWORKS.ethereum, address: "0x76d513681e54809f2711F1aDbA4803606262bA07" },
      { ...NETWORKS.base, address: "0x76d513681e54809f2711F1aDbA4803606262bA07" },
      { ...NETWORKS.arbitrum, address: "0x76d513681e54809f2711F1aDbA4803606262bA07" },
      { ...NETWORKS.polygon, address: "0x76d513681e54809f2711F1aDbA4803606262bA07" },
    ],
  },
  {
    symbol: "SOL",
    name: "Solana",
    logo: LOGOS.SOL,
    networks: [
      { ...NETWORKS.solana, address: "5vLMBez4oczF6wYHzkA1uBec7bHxzVaBmG98dbVoXk7B" },
      { ...NETWORKS.base, address: "0x5761C3616f72E3F7C74e4543a2247b7e6C07E215" },
    ],
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    logo: LOGOS.USDC,
    networks: [
      { ...NETWORKS.ethereum, address: "0x552A8F6d1074C5f365aeBCB4d73Ff17E0fcC6Cc3" },
      { ...NETWORKS.solana, address: "2yzHADfQbFHybDfD3VNuKjM6zL7goesadbEdHHZEdHvH" },
      { ...NETWORKS.base, address: "0x552A8F6d1074C5f365aeBCB4d73Ff17E0fcC6Cc3" },
      { ...NETWORKS.polygon, address: "0x552A8F6d1074C5f365aeBCB4d73Ff17E0fcC6Cc3" },
      { ...NETWORKS.arbitrum, address: "0x552A8F6d1074C5f365aeBCB4d73Ff17E0fcC6Cc3" },
    ],
  },
  {
    symbol: "USDT",
    name: "Tether",
    logo: LOGOS.USDT,
    networks: [
      { ...NETWORKS.ethereum, address: "0x1C252D20e76a874DC8724C1a8A63944033440FBb" },
      { ...NETWORKS.arbitrum, address: "0x1C252D20e76a874DC8724C1a8A63944033440FBb" },
      { ...NETWORKS.arbitrum, address: "0x1C252D20e76a874DC8724C1a8A63944033440FBb" },
    ],
  },
  {
    symbol: "MATIC",
    name: "Polygon",
    logo: LOGOS.MATIC,
    networks: [
      { ...NETWORKS.polygon, address: "0xA9adf34cc662d97fC2c7937FB22cc4831057c036" },
      { ...NETWORKS.ethereum, address: "0xA9adf34cc662d97fC2c7937FB22cc4831057c036" },
    ],
  },
];

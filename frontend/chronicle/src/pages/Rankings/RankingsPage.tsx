import { useSearchParams } from "react-router-dom"
import { MobileBottomAd } from "@/components/Ads/MobileBottomAd"
import { RankingsLanding } from "./RankingsLanding"
import { InstanceView } from "./InstanceView"

export function RankingsPage() {
  const [params] = useSearchParams()
  const instance = params.get("instance")

  return (
    <div className="container mx-auto px-4 py-8">
      {instance ? <InstanceView instanceName={instance} /> : <RankingsLanding />}
      <MobileBottomAd placement="rankings-mobile-bottom" />
    </div>
  )
}

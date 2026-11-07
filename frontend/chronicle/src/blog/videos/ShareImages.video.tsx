import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import {
  SHARE_IMAGE_EXAMPLES, SHARE_IMAGES_BOOKEND_FRAMES, SHARE_IMAGES_SCENE_FRAMES,
  shareImagePath,
} from "./shareImagesData";

const gold = "#c5a565";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function Bookend({ closing = false }: { closing?: boolean }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: "128px 105px", justifyContent: "center",
      opacity: interpolate(frame, [0, 18], [0, 1], clamp) }}>
      <div style={{ color: gold, fontSize: 24, letterSpacing: 5, textTransform: "uppercase" }}>Chronicle / Share images</div>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 80, lineHeight: 1.08, margin: "28px 0" }}>
        {closing ? <>Copy the link.<br />Share the story.</> : <>A good story starts<br />before the click.</>}
      </h1>
      <div style={{ width: 100, height: 3, background: gold, margin: "10px 0 28px" }} />
      <p style={{ fontSize: 28, color: "#c8c4bb", margin: 0, maxWidth: 960, lineHeight: 1.5 }}>
        {closing ? "Paste it into a chat with link previews enabled. Open the link for the full picture."
          : "Your raid. Your guild. Your next build. Now with a proper introduction."}
      </p>
      <div style={{ marginTop: 30, fontSize: 20, color: gold }}>chronicleclassic.com</div>
    </AbsoluteFill>
  );
}

function CardScene({ index }: { index: number }) {
  const frame = useCurrentFrame();
  const example = SHARE_IMAGE_EXAMPLES[index];
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 32 }}>
      <div style={{ fontSize: 17, color: gold, letterSpacing: 3, textTransform: "uppercase" }}>
        Chronicle / Share images / {`0${index + 1}`}
      </div>
      <h2 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 40, margin: "12px 0 22px" }}>{example.title}</h2>
      <Img src={staticFile(shareImagePath(example.id).slice(1))} style={{ width: 900, height: 472.5,
        borderRadius: 8, border: "1px solid #625238", boxShadow: "0 20px 60px #0008",
        opacity: interpolate(frame, [0, 16], [0, 1], clamp),
        translate: `0 ${interpolate(frame, [0, 20], [14, 0], clamp)}px` }} />
      <p style={{ fontSize: 24, color: "#e4dfd3", margin: "24px 0 0" }}>{example.caption}</p>
      <div style={{ fontSize: 16, color: "#aaa69d", marginTop: 10 }}>Illustrative data · Actual Chronicle card designs</div>
    </AbsoluteFill>
  );
}

/** Silent, caption-led tour. Uses frozen local images so playback never needs the OG service. */
export default function ShareImagesVideo() {
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 75% 20%, #302a20, #151614 65%)", color: "#f1eee7", fontFamily: "Arial, sans-serif" }}>
      <AbsoluteFill style={{ borderTop: `5px solid ${gold}`, borderBottom: "1px solid #625238" }} />
      <Sequence durationInFrames={SHARE_IMAGES_BOOKEND_FRAMES}><Bookend /></Sequence>
      {SHARE_IMAGE_EXAMPLES.map((example, index) => (
        <Sequence key={example.id} from={SHARE_IMAGES_BOOKEND_FRAMES + index * SHARE_IMAGES_SCENE_FRAMES} durationInFrames={SHARE_IMAGES_SCENE_FRAMES}>
          <CardScene index={index} />
        </Sequence>
      ))}
      <Sequence from={SHARE_IMAGES_BOOKEND_FRAMES + SHARE_IMAGE_EXAMPLES.length * SHARE_IMAGES_SCENE_FRAMES} durationInFrames={SHARE_IMAGES_BOOKEND_FRAMES}>
        <Bookend closing />
      </Sequence>
    </AbsoluteFill>
  );
}

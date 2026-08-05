export function VideoEmbed() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/80 bg-charcoal shadow-2xl">
      <video
        className="absolute inset-0 h-full w-full"
        controls
        playsInline
        preload="none"
        poster="https://i.ytimg.com/vi/A6hp1pRla7w/hqdefault.jpg"
        src="/videos/toropay-intro.mp4"
      >
        Your browser does not support video playback.
      </video>
    </div>
  )
}

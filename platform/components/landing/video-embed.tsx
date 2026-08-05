'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'

const VIDEO_ID = '6HERU_CQ-wg'

export function VideoEmbed() {
  const [playing, setPlaying] = useState(false)

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/80 bg-charcoal shadow-2xl">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
          title="ToroPay demo video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button onClick={() => setPlaying(true)} aria-label="Play video"
          className="group absolute inset-0 h-full w-full">
          <div className="absolute inset-0 bg-gradient-to-br from-charcoal to-primary-800" />
          {VIDEO_ID.startsWith('REPLACE') === false && (
            <img
              src={`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-80"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-xl transition-transform group-hover:scale-110">
              <Play className="ml-0.5 h-6 w-6 text-charcoal" fill="currentColor" />
            </span>
            <span className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              Watch the demo
            </span>
          </div>
        </button>
      )}
    </div>
  )
}

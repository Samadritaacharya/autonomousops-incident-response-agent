'use client'

import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react'

export function ShaderGradientBackdrop() {
  return (
    <div className="shader-gradient" aria-hidden="true">
      <ShaderGradientCanvas
        style={{ position: 'absolute', inset: 0 }}
        pixelDensity={1}
        fov={45}
        lazyLoad
      >
        <ShaderGradient
          control="props"
          type="plane"
          animate="on"
          color1="#00d992"
          color2="#101010"
          color3="#5e6ad2"
          uSpeed={0.12}
          uStrength={1.4}
          uDensity={1.2}
          uFrequency={4.4}
          brightness={0.7}
          grain="on"
          grainBlending={0.15}
          cDistance={4.8}
          cPolarAngle={110}
          cAzimuthAngle={170}
          lightType="3d"
          reflection={0.16}
        />
      </ShaderGradientCanvas>
    </div>
  )
}

'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const agents = [
  ['Triage', [-2.3, 1.2, 0.2]],
  ['Runbook', [-0.9, 2.15, -0.25]],
  ['RootCause', [1.05, 2.0, 0.15]],
  ['Risk', [2.35, 0.7, -0.1]],
  ['Resolution', [2.0, -1.35, 0.2]],
  ['Tools', [0.15, -2.15, -0.15]],
  ['Comms', [-2.05, -1.25, 0.15]],
] as const

const vertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform float uTime;

  void main() {
    vPosition = position;
    vNormal = normal;
    float wave = sin(position.y * 4.0 + uTime * 1.2) * 0.035;
    wave += sin(position.x * 5.0 - uTime * 0.8) * 0.025;
    vec3 displaced = position + normal * wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

const fragmentShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform float uTime;
  uniform vec3 uAccent;
  uniform vec3 uSecondary;

  void main() {
    float bands = sin((vPosition.x + vPosition.y) * 8.0 + uTime * 1.5) * 0.5 + 0.5;
    float flow = sin(vPosition.y * 12.0 - uTime * 2.0 + sin(vPosition.x * 4.0)) * 0.5 + 0.5;
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.4);
    vec3 base = mix(uSecondary * 0.42, uAccent, smoothstep(0.2, 0.9, bands * 0.65 + flow * 0.35));
    vec3 metal = mix(base * 0.45, vec3(0.95), fresnel * 0.72);
    float alpha = 0.92 + fresnel * 0.08;
    gl_FragColor = vec4(metal, alpha);
  }
`

type SceneProps = {
  activeIndex?: number
  completed?: number
  severity?: string
  reducedMotion?: boolean
}

function LiquidCore({ severity, reducedMotion = false }: { severity?: string; reducedMotion?: boolean }) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uAccent: { value: new THREE.Color(severity === 'P1' ? '#ff667a' : '#00d992') },
          uSecondary: { value: new THREE.Color('#5e6ad2') },
        },
        transparent: true,
      }),
    [severity],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    if (reducedMotion) return
    material.uniforms.uTime.value = state.clock.elapsedTime
    if (mesh.current) {
      mesh.current.rotation.y = state.clock.elapsedTime * 0.16
      mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.23) * 0.12
    }
  })

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[0.92, 6]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function Connections() {
  const geometry = useMemo(() => {
    const positions: number[] = []
    for (const [, position] of agents) {
      positions.push(0, 0, 0, position[0], position[1], position[2])
    }
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return buffer
  }, [])

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#2d6f5c', transparent: true, opacity: 0.45 }),
    [],
  )

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  return <lineSegments geometry={geometry} material={material} />
}

function Node({
  position,
  index,
  activeIndex = -1,
  completed = 0,
  reducedMotion = false,
}: {
  position: readonly [number, number, number]
  index: number
  activeIndex?: number
  completed?: number
  reducedMotion?: boolean
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const isActive = index === activeIndex
  const isComplete = index < completed

  useFrame((state) => {
    if (!mesh.current || reducedMotion) return
    const target = isActive ? 1.36 : isComplete ? 1.12 : 1
    const pulse = isActive ? Math.sin(state.clock.elapsedTime * 7) * 0.08 : 0
    const value = THREE.MathUtils.lerp(mesh.current.scale.x, target + pulse, 0.12)
    mesh.current.scale.setScalar(value)
  })

  return (
    <mesh ref={mesh} position={position} scale={isActive ? 1.25 : isComplete ? 1.1 : 1}>
      <sphereGeometry args={[0.16, 32, 32]} />
      <meshStandardMaterial
        color={isComplete || isActive ? '#dffcf2' : '#32433e'}
        emissive={isActive ? '#00d992' : isComplete ? '#195b46' : '#000000'}
        emissiveIntensity={isActive ? 2.4 : 0.8}
        roughness={0.28}
        metalness={0.55}
      />
    </mesh>
  )
}

function Scene({ activeIndex = -1, completed = 0, severity, reducedMotion = false }: SceneProps) {
  const group = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    if (reducedMotion) return
    if (group.current) group.current.rotation.z += delta * 0.015
    state.camera.position.x = Math.sin(state.clock.elapsedTime * 0.08) * 0.18
    state.camera.lookAt(0, 0, 0)
  })

  return (
    <group ref={group}>
      <Connections />
      <LiquidCore severity={severity} reducedMotion={reducedMotion} />
      {agents.map(([, position], index) => (
        <Node
          key={index}
          position={position}
          index={index}
          activeIndex={activeIndex}
          completed={completed}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  )
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function AgentScene(props: SceneProps) {
  const [webgl, setWebgl] = useState<boolean | null>(null)

  useEffect(() => {
    setWebgl(supportsWebGL())
  }, [])

  if (webgl === false) {
    return (
      <div className="scene-fallback" role="img" aria-label="Agent orchestration graph">
        <strong>AutonomousOps</strong>
        <span>Triage · Runbook · Root Cause · Risk · Resolution · Tools · Communications</span>
      </div>
    )
  }

  if (webgl === null) return <div className="scene-fallback" aria-hidden="true" />

  return (
    <Canvas
      camera={{ position: [0, 0, 6.4], fov: 42 }}
      dpr={[1, 1.5]}
      frameloop={props.reducedMotion ? 'demand' : 'always'}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.8} />
      <pointLight position={[4, 5, 5]} intensity={12} color="#dffcf2" />
      <pointLight position={[-4, -2, 3]} intensity={8} color="#5e6ad2" />
      <Scene {...props} />
    </Canvas>
  )
}

import { useEffect, useRef } from 'react';

interface ConfettiProps {
  active: boolean;
  duration?: number; // ms
}

class Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: 'circle' | 'square' | 'triangle';

  constructor(canvasWidth: number, canvasHeight: number) {
    // Start from the bottom-center or randomly around the center for a burst
    this.x = canvasWidth / 2 + (Math.random() - 0.5) * 40;
    this.y = canvasHeight + 10;
    
    this.size = Math.random() * 8 + 6;
    
    // Clay design system palette
    const colors = [
      '#ff4d8b', // brand-pink
      '#b8a4ed', // brand-lavender
      '#ffb084', // brand-peach
      '#e8b94a', // brand-ochre
      '#a4d4c5', // brand-mint
      '#ff6b5a', // brand-coral
    ];
    this.color = colors[Math.floor(Math.random() * colors.length)];
    
    // Upward explosion velocities
    const angle = (Math.random() * 60 + 60) * (Math.PI / 180); // 60 to 120 degrees (upwards)
    const speed = Math.random() * 12 + 10;
    this.vx = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
    this.vy = -Math.sin(angle) * speed;
    
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 8;
    this.opacity = 1;
    
    const shapes: ('circle' | 'square' | 'triangle')[] = ['circle', 'square', 'triangle'];
    this.shape = shapes[Math.floor(Math.random() * shapes.length)];
  }

  update(gravity: number, friction: number) {
    this.x += this.vx;
    this.y += this.vy;
    
    // Apply physics
    this.vy += gravity;
    this.vx *= friction;
    this.vy *= friction;
    
    this.rotation += this.rotationSpeed;
    
    // Fade out when falling past middle screen
    if (this.vy > 1) {
      this.opacity -= 0.008;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.opacity <= 0) return;
    
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    
    if (this.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, -this.size / 2);
      ctx.lineTo(this.size / 2, this.size / 2);
      ctx.lineTo(-this.size / 2, this.size / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    }
    
    ctx.restore();
  }
}

export function Confetti({ active, duration = 3500 }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationFrameId: number;
    let particles: Particle[] = [];
    const gravity = 0.2;
    const friction = 0.98;
    let isHalted = false;
    
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Initial burst
    for (let i = 0; i < 150; i++) {
      particles.push(new Particle(canvas.width, canvas.height));
    }
    
    // Continuous generation for first 1.5 seconds
    const interval = setInterval(() => {
      if (isHalted) return;
      for (let i = 0; i < 5; i++) {
        particles.push(new Particle(canvas.width, canvas.height));
      }
    }, 50);
    
    // Stop generating after 1.5s
    const stopTimeout = setTimeout(() => {
      clearInterval(interval);
    }, 1500);

    // Halt all animations after the duration limit
    const haltTimeout = setTimeout(() => {
      isHalted = true;
      particles = [];
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }, duration);
    
    const tick = () => {
      if (isHalted) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let idx = particles.length - 1; idx >= 0; idx--) {
        const p = particles[idx];
        p.update(gravity, friction);
        p.draw(ctx);
        
        // Remove dead particles
        if (p.opacity <= 0 || p.y > canvas.height + 20) {
          particles.splice(idx, 1);
        }
      }
      
      if (particles.length > 0 && !isHalted) {
        animationFrameId = requestAnimationFrame(tick);
      }
    };
    tick();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(interval);
      clearTimeout(stopTimeout);
      clearTimeout(haltTimeout);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [active, duration]);

  if (!active) return null;

  return (
    <canvas 
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50 w-full h-full"
    />
  );
}

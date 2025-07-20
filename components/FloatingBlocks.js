import { useEffect, useRef } from 'react';

const SIZES = [16, 24, 32, 40, 48, 56, 64];
const MIN_DURATION = 15; // seconds
const MAX_DURATION = 30; // seconds
const SPAWN_INTERVAL = 1200; // ms

function randomBetween(a, b) {
  return Math.random() * (b - a) + a;
}

function randomInt(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function FloatingBlocks() {
  const containerRef = useRef(null);
  const blocksRef = useRef([]);
  const spawnTimeout = useRef();

  useEffect(() => {
    let running = true;

    function spawnBlock() {
      if (!containerRef.current || !running) return;
      const size = randomInt(SIZES);
      const left = randomBetween(0, 100); // percent
      const duration = randomBetween(MIN_DURATION, MAX_DURATION); // seconds
      const block = document.createElement('div');
      block.className = 'pixel-block';
      block.style.width = `${size}px`;
      block.style.height = `${size}px`;
      block.style.left = `${left}%`;
      block.style.bottom = `-64px`;
      block.style.animationDuration = `${duration}s`;
      block.style.position = 'absolute';
      block.style.pointerEvents = 'none';
      block.style.opacity = 0.85;
      // Random slight offset for depth effect
      block.style.filter = `brightness(${randomBetween(0.92, 1)})`;
      // Add to container
      containerRef.current.appendChild(block);
      blocksRef.current.push(block);
      // Remove block after animation
      block.addEventListener('animationend', () => {
        if (containerRef.current && block.parentNode === containerRef.current) {
          containerRef.current.removeChild(block);
        }
        blocksRef.current = blocksRef.current.filter(b => b !== block);
      });
    }

    function loop() {
      if (!running) return;
      spawnBlock();
      spawnTimeout.current = setTimeout(loop, SPAWN_INTERVAL);
    }
    loop();
    return () => {
      running = false;
      clearTimeout(spawnTimeout.current);
      // Clean up all blocks
      if (containerRef.current) {
        blocksRef.current.forEach(block => {
          if (block.parentNode === containerRef.current) {
            containerRef.current.removeChild(block);
          }
        });
      }
      blocksRef.current = [];
    };
  }, []);

  return <div ref={containerRef} className="floating-blocks" aria-hidden="true" />;
} 
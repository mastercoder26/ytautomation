import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Application } from '@splinetool/runtime';

const Spline = lazy(() => import('@splinetool/react-spline'));

const SPLINE_SCENE_URL =
  'https://prod.spline.design/eFR1nrUzjHh1dEZS/scene.splinecode';

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return reducedMotion;
}

export function SplineHero() {
  const reduceMotion = usePrefersReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const splineAppRef = useRef<Application | null>(null);
  const isHeroVisibleRef = useRef(true);

  useEffect(() => {
    const hero = heroRef.current;

    if (!hero || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) {
        return;
      }

      isHeroVisibleRef.current = entry.isIntersecting;

      if (entry.isIntersecting) {
        splineAppRef.current?.play();
      } else {
        splineAppRef.current?.stop();
      }
    });

    observer.observe(hero);

    return () => observer.disconnect();
  }, []);

  const handleSplineLoad = (app: Application) => {
    splineAppRef.current = app;

    if (!isHeroVisibleRef.current) {
      app.stop();
    }
  };

  return (
    <section
      ref={heroRef}
      aria-label="BrandPreflight campaign control room"
      className="spline-hero"
    >
      <div className="spline-watermark-cover" aria-hidden="true">
        {!reduceMotion && (
          <Suspense fallback={null}>
            <Spline
              scene={SPLINE_SCENE_URL}
              className="spline-canvas"
              onLoad={handleSplineLoad}
            />
          </Suspense>
        )}
      </div>
      <div className="spline-vignette" aria-hidden="true" />
    </section>
  );
}

"use client";
import { useEffect } from "react";

/** Adds html.motion-ok only when the reader hasn't asked for reduced motion, so no-JS and reduced-motion renders are the finished page. */
export function MotionFlag() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => document.documentElement.classList.toggle("motion-ok", !mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return null;
}

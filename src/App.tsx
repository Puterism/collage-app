import "./index.css";
import type {
  CSSProperties,
  DragEvent,
  PointerEvent,
  WheelEvent,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type CollageSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type CollageLayout = {
  id: string;
  name: string;
  slots: CollageSlot[];
};

type CollageImage = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  img: HTMLImageElement;
};

type SlotEdit = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type RatioOption = {
  id: string;
  label: string;
  width: number;
  height: number;
};

type SizeOption = {
  id: string;
  label: string;
  longEdge: number;
};

type SlotSize = {
  width: number;
  height: number;
};

type Step = "select" | "layout" | "preview";

const steps: { id: Step; label: string; helper: string }[] = [
  { id: "select", label: "Photos", helper: "Select & order" },
  { id: "layout", label: "Layout", helper: "Format & size" },
  { id: "preview", label: "Preview", helper: "Edit & export" },
];

const layouts: CollageLayout[] = [
  {
    id: "solo",
    name: "Solo",
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  {
    id: "split",
    name: "Split",
    slots: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: "stack",
    name: "Stack",
    slots: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: "grid",
    name: "Grid",
    slots: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "strip",
    name: "Strip",
    slots: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  {
    id: "hero",
    name: "Hero",
    slots: [
      { x: 0, y: 0, w: 0.6, h: 1 },
      { x: 0.6, y: 0, w: 0.4, h: 0.5 },
      { x: 0.6, y: 0.5, w: 0.4, h: 0.5 },
    ],
  },
];

const ratioOptions: RatioOption[] = [
  { id: "1:1", label: "1:1 Square", width: 1, height: 1 },
  { id: "4:5", label: "4:5 Portrait", width: 4, height: 5 },
  { id: "3:4", label: "3:4 Portrait", width: 3, height: 4 },
  { id: "16:9", label: "16:9 Wide", width: 16, height: 9 },
  { id: "9:16", label: "9:16 Story", width: 9, height: 16 },
];

const sizeOptions: SizeOption[] = [
  { id: "1080", label: "1080 px", longEdge: 1080 },
  { id: "1600", label: "1600 px", longEdge: 1600 },
  { id: "2048", label: "2048 px", longEdge: 2048 },
  { id: "3072", label: "3072 px", longEdge: 3072 },
];

const thumbnailGap = 6;

const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getCanvasSize = (ratio: RatioOption, size: SizeOption) => {
  const ratioValue = ratio.width / ratio.height;
  if (ratioValue >= 1) {
    return {
      width: size.longEdge,
      height: Math.round(size.longEdge / ratioValue),
    };
  }
  return {
    width: Math.round(size.longEdge * ratioValue),
    height: size.longEdge,
  };
};

const loadImage = (file: File): Promise<CollageImage> => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;

  return new Promise((resolve, reject) => {
    img.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        img,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image."));
    };
  });
};

const defaultSlotEdit: SlotEdit = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export function App() {
  const [images, setImages] = useState<CollageImage[]>([]);
  const [layoutId, setLayoutId] = useState(layouts[3].id);
  const [ratioId, setRatioId] = useState(ratioOptions[0].id);
  const [sizeId, setSizeId] = useState(sizeOptions[1].id);
  const [slotEdits, setSlotEdits] = useState<SlotEdit[]>(
    layouts[3].slots.map(() => ({ ...defaultSlotEdit }))
  );
  const [activeSlot, setActiveSlot] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [slotSizes, setSlotSizes] = useState<SlotSize[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [step, setStep] = useState<Step>("select");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gestureRef = useRef<{
    slotIndex: number;
    pointers: Map<number, { x: number; y: number }>;
    lastDrag: { x: number; y: number } | null;
    startDistance: number;
    startScale: number;
  } | null>(null);
  const slotEditsRef = useRef(slotEdits);
  const imagesRef = useRef(images);

  const layout = useMemo(
    () => layouts.find((item) => item.id === layoutId) ?? layouts[0],
    [layoutId]
  );

  const ratio = useMemo(
    () => ratioOptions.find((item) => item.id === ratioId) ?? ratioOptions[0],
    [ratioId]
  );

  const size = useMemo(
    () => sizeOptions.find((item) => item.id === sizeId) ?? sizeOptions[0],
    [sizeId]
  );

  const collageCanvasSize = useMemo(
    () => getCanvasSize(ratio, size),
    [ratio, size]
  );

  const stepIndex = steps.findIndex((item) => item.id === step);
  const canMoveToLayout = images.length > 0;
  const canMoveToPreview = images.length > 0;

  const isStepEnabled = (target: Step) => {
    if (target === "select") {
      return true;
    }
    if (target === "layout") {
      return canMoveToLayout;
    }
    return canMoveToPreview;
  };

  useEffect(() => {
    slotEditsRef.current = slotEdits;
  }, [slotEdits]);

  useEffect(() => {
    if (!images.length && step !== "select") {
      setStep("select");
    }
  }, [images.length, step]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    };
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setSlotSizes((prev) => {
        const next = [...prev];
        entries.forEach((entry) => {
          const index = Number(
            (entry.target as HTMLElement).dataset.slotIndex ?? -1
          );
          if (index >= 0) {
            next[index] = {
              width: entry.contentRect.width,
              height: entry.contentRect.height,
            };
          }
        });
        return next;
      });
    });

    slotRefs.current.forEach((slot, index) => {
      if (slot) {
        slot.dataset.slotIndex = String(index);
        observer.observe(slot);
      }
    });

    return () => observer.disconnect();
  }, [layoutId, images.length]);

  useEffect(() => {
    setSlotEdits((prev) => {
      const targetLength = Math.max(layout.slots.length, images.length);
      return Array.from({ length: targetLength }, (_, index) => {
        return prev[index] ?? { ...defaultSlotEdit };
      });
    });
    setActiveSlot((prev) => Math.min(prev, layout.slots.length - 1));
  }, [layout, images.length]);

  const clampSlotEdit = (
    index: number,
    candidate: SlotEdit,
    overrideScale?: number
  ) => {
    const image = images[index];
    const slotSize = slotSizes[index];
    if (!image || !slotSize) {
      return candidate;
    }

    const baseScale = Math.max(
      slotSize.width / image.width,
      slotSize.height / image.height
    );
    const scale = overrideScale ?? candidate.scale;
    const displayWidth = image.width * baseScale * scale;
    const displayHeight = image.height * baseScale * scale;
    const maxOffsetX = Math.max(0, (displayWidth - slotSize.width) / 2);
    const maxOffsetY = Math.max(0, (displayHeight - slotSize.height) / 2);

    return {
      ...candidate,
      scale,
      offsetX: clampValue(candidate.offsetX, -maxOffsetX, maxOffsetX),
      offsetY: clampValue(candidate.offsetY, -maxOffsetY, maxOffsetY),
    };
  };

  const getThumbnailSlotStyle = (slot: CollageSlot): CSSProperties => {
    return {
      left: `calc(${slot.x * 100}% + ${thumbnailGap / 2}px)`,
      top: `calc(${slot.y * 100}% + ${thumbnailGap / 2}px)`,
      width: `calc(${slot.w * 100}% - ${thumbnailGap}px)`,
      height: `calc(${slot.h * 100}% - ${thumbnailGap}px)`,
    };
  };

  const updateSlotEdit = (
    index: number,
    updater: (current: SlotEdit) => SlotEdit
  ) => {
    setSlotEdits((prev) => {
      const next = [...prev];
      const current = next[index] ?? { ...defaultSlotEdit };
      next[index] = clampSlotEdit(index, updater(current));
      return next;
    });
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) {
      return;
    }

    const files = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/")
    );
    if (!files.length) {
      return;
    }

    try {
      const loaded = await Promise.all(files.map(loadImage));
      setImages((prev) => [...prev, ...loaded]);
    } catch (error) {
      console.error(error);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragEnter = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      return;
    }
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setSlotEdits((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleWheel = (index: number, event: WheelEvent<HTMLDivElement>) => {
    if (!images[index]) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const nextScaleDelta = direction * 0.08;
    updateSlotEdit(index, (current) => {
      const nextScale = clampValue(current.scale + nextScaleDelta, 1, 3);
      return clampSlotEdit(index, { ...current, scale: nextScale }, nextScale);
    });
  };

  const handlePointerDown = (
    index: number,
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!images[index]) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveSlot(index);

    const currentScale = slotEditsRef.current[index]?.scale ?? 1;
    if (!gestureRef.current || gestureRef.current.slotIndex !== index) {
      gestureRef.current = {
        slotIndex: index,
        pointers: new Map(),
        lastDrag: null,
        startDistance: 0,
        startScale: currentScale,
      };
    }

    const gesture = gestureRef.current;
    gesture.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (gesture.pointers.size === 1) {
      gesture.lastDrag = { x: event.clientX, y: event.clientY };
      gesture.startScale = currentScale;
      gesture.startDistance = 0;
    } else if (gesture.pointers.size === 2) {
      const [first, second] = Array.from(gesture.pointers.values());
      gesture.startDistance = Math.hypot(
        first.x - second.x,
        first.y - second.y
      );
      gesture.startScale = currentScale;
      gesture.lastDrag = null;
    }
  };

  const handlePointerMove = (
    index: number,
    event: PointerEvent<HTMLDivElement>
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.slotIndex !== index) {
      return;
    }
    if (!gesture.pointers.has(event.pointerId)) {
      return;
    }
    gesture.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (gesture.pointers.size === 1 && gesture.lastDrag) {
      const dx = event.clientX - gesture.lastDrag.x;
      const dy = event.clientY - gesture.lastDrag.y;
      gesture.lastDrag = { x: event.clientX, y: event.clientY };
      updateSlotEdit(index, (current) => ({
        ...current,
        offsetX: current.offsetX + dx,
        offsetY: current.offsetY + dy,
      }));
      return;
    }

    if (gesture.pointers.size === 2 && gesture.startDistance > 0) {
      const [first, second] = Array.from(gesture.pointers.values());
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const nextScale = clampValue(
        gesture.startScale * (distance / gesture.startDistance),
        1,
        3
      );
      updateSlotEdit(index, (current) =>
        clampSlotEdit(index, { ...current, scale: nextScale }, nextScale)
      );
    }
  };

  const handlePointerEnd = (
    index: number,
    event: PointerEvent<HTMLDivElement>
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.slotIndex !== index) {
      return;
    }
    gesture.pointers.delete(event.pointerId);
    if (gesture.pointers.size === 1) {
      const remaining = Array.from(gesture.pointers.values())[0];
      gesture.lastDrag = { x: remaining.x, y: remaining.y };
      gesture.startScale = slotEditsRef.current[index]?.scale ?? 1;
      gesture.startDistance = 0;
    } else if (gesture.pointers.size === 0) {
      gestureRef.current = null;
    }
  };

  const resetActiveSlot = () => {
    updateSlotEdit(activeSlot, () => ({ ...defaultSlotEdit }));
  };

  const resetAllSlots = () => {
    setSlotEdits((prev) => prev.map(() => ({ ...defaultSlotEdit })));
  };

  const handleExport = async () => {
    if (!images.length) {
      return;
    }
    setIsExporting(true);
    const { width, height } = collageCanvasSize;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsExporting(false);
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    layout.slots.forEach((slot, index) => {
      const image = images[index];
      if (!image) {
        return;
      }

      const slotX = slot.x * width;
      const slotY = slot.y * height;
      const slotW = slot.w * width;
      const slotH = slot.h * height;
      const edit = slotEdits[index] ?? defaultSlotEdit;
      const baseScale = Math.max(slotW / image.width, slotH / image.height);
      const totalScale = baseScale * edit.scale;
      const displayW = image.width * totalScale;
      const displayH = image.height * totalScale;
      const maxOffsetX = Math.max(0, (displayW - slotW) / 2);
      const maxOffsetY = Math.max(0, (displayH - slotH) / 2);
      const offsetX = clampValue(edit.offsetX, -maxOffsetX, maxOffsetX);
      const offsetY = clampValue(edit.offsetY, -maxOffsetY, maxOffsetY);
      const drawX = slotX + slotW / 2 - displayW / 2 + offsetX;
      const drawY = slotY + slotH / 2 - displayH / 2 + offsetY;

      ctx.save();
      ctx.beginPath();
      ctx.rect(slotX, slotY, slotW, slotH);
      ctx.clip();
      ctx.drawImage(image.img, drawX, drawY, displayW, displayH);
      ctx.restore();
    });

    canvas.toBlob((blob) => {
      if (!blob) {
        setIsExporting(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      link.href = url;
      link.download = `collage-${timestamp}.png`;
      link.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    }, "image/png");
  };

  const imageSlots = layout.slots.map((_, index) => images[index] ?? null);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffe7c5_0%,transparent_60%),radial-gradient(circle_at_top_right,#c8f2d4_0%,transparent_55%),linear-gradient(180deg,#fff6eb_0%,#f4f2ea_55%,#eef0eb_100%)] text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-16 pt-10">
        <header className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
            Offline Collage Studio
          </span>
          <h1 className="font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
            Build a collage in a few calm steps.
          </h1>
          <p className="max-w-2xl text-base text-slate-600">
            Select photos, arrange the order, choose a format, and fine-tune each
            frame with drag and pinch. Everything stays in the browser.
          </p>
        </header>

        <div className="flex flex-col gap-8">
          <nav className="flex flex-wrap gap-3">
            {steps.map((item, index) => {
              const isActive = item.id === step;
              const enabled = isStepEnabled(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`flex min-w-[150px] flex-1 flex-col gap-1 rounded-2xl border px-4 py-3 text-left text-xs transition ${
                    isActive
                      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  } ${enabled ? "" : "cursor-not-allowed opacity-40"}`}
                  onClick={() => setStep(item.id)}
                  disabled={!enabled}
                >
                  <span className="text-[10px] uppercase tracking-[0.4em] text-slate-400">
                    Step {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {item.label}
                  </span>
                  <span className="text-xs text-slate-400">{item.helper}</span>
                </button>
              );
            })}
          </nav>

          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Step {stepIndex + 1} of {steps.length}
          </div>

          {step === "select" && (
            <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-[0_15px_40px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Photos
                  </h2>
                  <p className="text-sm text-slate-500">
                    Select multiple images and drag to reorder the collage
                    sequence.
                  </p>
                </div>
                <label
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300/80 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <span className="text-base font-medium text-slate-700">
                    Drop files here
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    or browse
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => handleFiles(event.target.files)}
                  />
                </label>

                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>{images.length} selected</span>
                  <span>Uses first {layout.slots.length}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {images.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                      Add images to begin.
                    </div>
                  )}
                  {images.map((image, index) => (
                    <div
                      key={image.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                        index === activeSlot
                          ? "border-emerald-300 bg-emerald-50/80 text-emerald-900"
                          : "border-slate-200 bg-white"
                      }`}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={handleDragEnd}
                      onClick={() => setActiveSlot(index)}
                    >
                      <div className="h-10 w-10 overflow-hidden rounded-lg bg-slate-100">
                        <img
                          src={image.url}
                          alt={image.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-1 flex-col">
                        <span className="font-medium text-slate-800">
                          {image.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          Slot {index + 1}
                        </span>
                      </div>
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        Drag
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    onClick={() => setStep("layout")}
                    disabled={!canMoveToLayout}
                  >
                    Next: Layout
                  </button>
                </div>
              </div>
            </section>
          )}

          {step === "layout" && (
            <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-[0_15px_40px_rgba(15,23,42,0.08)] backdrop-blur">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Layout
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {layouts.map((layoutOption) => (
                    <button
                      key={layoutOption.id}
                      type="button"
                      className={`flex flex-col gap-2 rounded-2xl border px-3 py-2 text-left text-xs transition ${
                        layoutOption.id === layoutId
                          ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                      onClick={() => setLayoutId(layoutOption.id)}
                    >
                    <div className="relative h-16 w-full rounded-xl bg-slate-200/70 p-1 shadow-inner">
                      {layoutOption.slots.map((slot, index) => (
                        <span
                          key={`${layoutOption.id}-${index}`}
                          className="absolute rounded-lg border border-slate-200 bg-white shadow-sm"
                          style={getThumbnailSlotStyle(slot)}
                        />
                      ))}
                    </div>
                      <span className="font-medium text-slate-700">
                        {layoutOption.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-[0_15px_40px_rgba(15,23,42,0.08)] backdrop-blur">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Output
                </h2>
                <div className="mt-4 flex flex-col gap-4 text-sm">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Ratio
                    </span>
                    <select
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700"
                      value={ratioId}
                      onChange={(event) => setRatioId(event.target.value)}
                    >
                      {ratioOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Long edge
                    </span>
                    <select
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700"
                      value={sizeId}
                      onChange={(event) => setSizeId(event.target.value)}
                    >
                      {sizeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                    Export size: {collageCanvasSize.width} x{" "}
                    {collageCanvasSize.height}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-3 lg:col-span-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
                  onClick={() => setStep("select")}
                >
                  Back to photos
                </button>
                <button
                  type="button"
                  className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  onClick={() => setStep("preview")}
                  disabled={!canMoveToPreview}
                >
                  Next: Preview
                </button>
              </div>
            </section>
          )}

          {step === "preview" && (
            <section className="flex flex-col gap-5">
              <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_15px_40px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-2">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Preview
                    </h2>
                    <p className="text-xs text-slate-400">
                      Drag to move, pinch or scroll to zoom.
                    </p>
                    <p className="text-xs text-slate-400">
                      Export size: {collageCanvasSize.width} x{" "}
                      {collageCanvasSize.height}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
                      onClick={() => setStep("layout")}
                    >
                      Back to layout
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                      onClick={handleExport}
                      disabled={!images.length || isExporting}
                    >
                      {isExporting ? "Preparing..." : "Download collage"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 px-2 pb-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                    onClick={resetActiveSlot}
                    disabled={!images[activeSlot]}
                  >
                    Reset active frame
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                    onClick={resetAllSlots}
                    disabled={!images.length}
                  >
                    Reset all frames
                  </button>
                </div>

                <div className="mt-4 flex justify-center">
                  <div
                    className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-inner"
                    style={{
                      aspectRatio: `${ratio.width} / ${ratio.height}`,
                    }}
                  >
                    {layout.slots.map((slot, index) => {
                      const image = imageSlots[index];
                      const edit = slotEdits[index] ?? defaultSlotEdit;
                      const isActive = index === activeSlot;
                      return (
                        <div
                          key={`${layout.id}-${index}`}
                          ref={(element) => {
                            slotRefs.current[index] = element;
                          }}
                          className={`absolute overflow-hidden border border-white/70 bg-slate-100 ${
                            isActive ? "ring-2 ring-emerald-400" : ""
                          }`}
                          style={{
                            left: `${slot.x * 100}%`,
                            top: `${slot.y * 100}%`,
                            width: `${slot.w * 100}%`,
                            height: `${slot.h * 100}%`,
                            touchAction: "none",
                          }}
                          onPointerDown={(event) =>
                            handlePointerDown(index, event)
                          }
                          onPointerMove={(event) =>
                            handlePointerMove(index, event)
                          }
                          onPointerUp={(event) => handlePointerEnd(index, event)}
                          onPointerCancel={(event) =>
                            handlePointerEnd(index, event)
                          }
                          onWheel={(event) => handleWheel(index, event)}
                          onClick={() => setActiveSlot(index)}
                        >
                          {image ? (
                            <img
                              src={image.url}
                              alt={`Slot ${index + 1}`}
                              className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full select-none object-cover"
                              style={{
                                transform: `translate(-50%, -50%) translate(${edit.offsetX}px, ${edit.offsetY}px) scale(${edit.scale})`,
                              }}
                              draggable={false}
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                              <span>Slot {index + 1}</span>
                            </div>
                          )}
                          {image && (
                            <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white">
                              {index + 1}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

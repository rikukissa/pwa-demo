import React, {
  PropsWithChildren,
  UIEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { UserMediaError, useUserMedia } from "@vardius/react-user-media";
import * as localForage from "localforage";
import { animated, useSpring } from "react-spring";
import "./App.css";
import { useGesture } from "react-with-gesture";
import clamp from "lodash-es/clamp";
import ReactDOM from "react-dom";

localForage.config({
  driver: localForage.INDEXEDDB,
  name: "grow",
  version: 1.0,
  storeName: "state",
});

type Image = { id: number; url: string };

function Overlay(props: PropsWithChildren<{ image: Image }>) {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const { image } = props;
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    navigator.serviceWorker.onmessage = (event) => {
      setImageData(event.data);
    };
  }, []);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = image.url;

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0);

      const imageData = context.getImageData(0, 0, img.width, img.height);

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "IMAGE_DATA",
          imageData,
        });
      }
    };
  }, [props.image]);

  useEffect(() => {
    if (!canvas.current || !imageData) {
      return;
    }

    const w = imageData.width;
    const h = imageData.height;

    canvas.current.width = w;
    canvas.current.height = h;

    const ctx = canvas.current.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0, 0, 0, w, h);
  }, [canvas.current, imageData]);

  return (
    <div className="overlay">
      <canvas ref={canvas}></canvas>
    </div>
  );
}

function SwipeUp(
  props: PropsWithChildren<{
    x: number;
    onClick: () => void;
    onSwipe: () => void;
    onSwipeStart: () => void;
  }>
) {
  const onSwipe = React.useRef(props.onSwipe);
  const onSwipeStart = React.useRef(props.onSwipeStart);
  const x = React.useRef(props.x);

  const [{ xy }, set] = useSpring<{
    xy: [number, number];
    onFrame: unknown;
  }>(() => ({
    xy: [props.x, 0] as [number, number],
    onFrame: () => {
      const value = xy.getValue() as [number, number];
      if (value[1] < -500) {
        onSwipe.current();
      }
    },
  }));

  useEffect(() => {
    x.current = props.x;

    set({ xy: [props.x, 0] });
  }, [props.x]);

  React.useEffect(() => {
    onSwipe.current = props.onSwipe;
    onSwipeStart.current = props.onSwipeStart;
  }, [props.onSwipe, props.onSwipeStart]);

  const bind = useGesture(
    ({ event, down, delta, velocity, direction: [xDir] }) => {
      event.stopPropagation();

      const trigger = velocity > 0.3 || delta[1] < -100;
      velocity = clamp(velocity, 1, 12);

      if (Math.abs(delta[1]) < Math.abs(delta[0])) {
        return;
      }

      if (!down && trigger) {
        onSwipeStart.current();
        const y = -window.innerHeight - 200;

        return set({
          xy: [x.current, y],
          config: { tension: 500 * velocity, friction: 50 },
        });
      }

      set({
        xy: !down ? [x.current, 0] : [x.current, Math.min(10, delta[1])],
        config: { mass: velocity, tension: 500 * velocity, friction: 50 },
      });
    }
  );

  return (
    <animated.div
      {...bind()}
      onClick={(e) => {
        props.onClick();
        e.stopPropagation();
      }}
      style={{
        position: "absolute",
        transform: xy.interpolate(((x: number, y: number) => {
          return `translate3d(${x}px,${y}px,0)`;
        }) as any),
      }}
    >
      {props.children}
    </animated.div>
  );
}

function App() {
  const [images, setImages] = useState<Image[]>([]);
  const [selected, setSelected] = useState<Image | undefined>(images[0]);
  const [markForDeletion, setMarkForDeletion] = useState<Image[]>([]);
  const { stream, error } = useUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
    },
  });

  function selectPicture(event: UIEvent<HTMLDivElement>) {
    const target = event.target as HTMLDivElement;
    const scrollPercentage = clamp(
      target.scrollLeft / (target.scrollWidth - target.clientWidth),
      0,
      1
    );
    setSelected(images[Math.floor(scrollPercentage * (images.length - 1))]);
  }

  const video = useRef<HTMLVideoElement>(null);

  function deleteImage(image: Image) {
    const newImages = images.filter((i) => i.id !== image.id);
    ReactDOM.unstable_batchedUpdates(() => {
      setMarkForDeletion(markForDeletion.filter((i) => i !== image));
      setImages(newImages);
    });

    localForage
      .setItem("images", JSON.stringify(newImages))
      .catch((err) => alert(err.message));
  }

  function capture() {
    const canvas = document.createElement("canvas");
    // scale the canvas accordingly
    canvas.width = video.current!.getBoundingClientRect().width;
    canvas.height = video.current!.getBoundingClientRect().height;

    // draw the video at that frame
    canvas
      .getContext("2d")!
      .drawImage(video.current!, 0, 0, canvas.width, canvas.height);
    // convert it to a usable data URL
    const dataURL = canvas.toDataURL();
    const newImages = [{ id: Date.now(), url: dataURL }].concat(images);
    setSelected(newImages[0]);
    setImages(newImages);

    localForage
      .setItem("images", JSON.stringify(newImages))
      .catch((err) => alert(err.message));
  }

  useEffect(() => {
    if (stream) {
      video.current!.srcObject = stream;
    }
  }, [stream]);
  useEffect(() => {
    if (selected && images.indexOf(selected) === -1) {
      setSelected(images[0]);
    }
    if (selected && markForDeletion.includes(selected)) {
      const index = images.indexOf(selected);
      const next = images[index + 1];
      const prev = images[index - 1];
      setSelected(next || prev);
    }
  }, [images, markForDeletion]);

  useEffect(() => {
    (async () => {
      const storedImages = JSON.parse(
        (await localForage.getItem<string>("images")) || "[]"
      );

      setImages(storedImages);
      setSelected(storedImages[0]);
    })();
  }, []);

  if (error) {
    return <UserMediaError error={error} />;
  }

  return (
    <>
      <div className="video-container">
        <video autoPlay playsInline onClick={capture} ref={video} />
        {selected && <Overlay image={selected} />}
      </div>
      <div onScroll={selectPicture} onClick={capture} className="images">
        <div className={"image image-current"}></div>
        {images.map((image, i) => {
          const x =
            (i + 1) * 115 -
            markForDeletion.filter((del) => images.indexOf(del) < i).length *
              115;

          return (
            <SwipeUp
              x={x}
              onClick={() =>
                selected === image ? setSelected(undefined) : setSelected(image)
              }
              onSwipe={() => deleteImage(image)}
              onSwipeStart={() => {
                setMarkForDeletion(markForDeletion.concat(image));
              }}
              key={image.id}
            >
              <div
                className={"image" + (selected === image ? " selected" : "")}
              >
                <img src={image.url} />
              </div>
            </SwipeUp>
          );
        })}
      </div>
    </>
  );
}

export default App;

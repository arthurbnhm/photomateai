import Image from "next/image";
import { motion } from "framer-motion";

// This component renders the three animated images.
// It encapsulates the image configurations and animation logic.

export function AnimatedTrainingImages() {
  const imageConfigs = [
    { src: "/landing/01.webp", alt: "Sample 1", id: 'left', initialRotate: -8 },
    { src: "/landing/02.webp", alt: "Sample 2", id: 'center', initialRotate: 0, initialScale: 1.05, initialZ: 10 },
    { src: "/landing/03.webp", alt: "Sample 3", id: 'right', initialRotate: 8 },
  ];

  const animationProps = (config: typeof imageConfigs[0]) => {
    if (config.id === 'center') {
      return {
        initial: {
          rotate: config.initialRotate,
          scale: config.initialScale,
          zIndex: config.initialZ,
        },
        animate: {
          rotate: config.initialRotate,
          scale: config.initialScale,
          zIndex: config.initialZ,
        }
      };
    }

    const direction = config.id === 'left' ? 1 : -1;
    const initialX = 0;
    const alignWithCenterTranslation = 72;
    const nestedX = alignWithCenterTranslation * direction;
    const nestedScale = 0.75;

    const timeToNested = 0.8;
    const timeHoldNested = 1.0;
    const timeToInitial = 0.8;
    const timeHoldInitial = 2.0;
    const totalDuration = timeToNested + timeHoldNested + timeToInitial + timeHoldInitial;

    return {
      initial: {
        rotate: config.initialRotate,
        x: initialX,
        scale: 1,
        zIndex: 0,
      },
      animate: {
        x: [initialX, nestedX, nestedX, initialX, initialX],
        rotate: [config.initialRotate, 0, 0, config.initialRotate, config.initialRotate],
        scale: [1, nestedScale, nestedScale, 1, 1],
        zIndex: [0, 5, 5, 0, 0],
      },
      transition: {
        duration: totalDuration,
        repeat: Infinity,
        ease: "easeInOut",
        times: [
          0,
          timeToNested / totalDuration,
          (timeToNested + timeHoldNested) / totalDuration,
          (timeToNested + timeHoldNested + timeToInitial) / totalDuration,
          1,
        ],
        delay: config.id === 'left' ? 0 : 0.2,
      }
    };
  };

  return (
    <div className="flex justify-center items-center h-24"> 
      {imageConfigs.map((imgConfig, index) => {
        const anim = animationProps(imgConfig);
        return (
          <motion.div
            key={imgConfig.id}
            className={`relative w-20 h-20 rounded-lg overflow-hidden shadow-md border-4 border-white 
                       ${imgConfig.id === 'center' ? 'mx-1' : (imgConfig.id === 'left' ? 'mr-[-12px]' : 'ml-[-12px]')}`}
            initial={anim.initial}
            animate={anim.animate}
            transition={anim.transition}
          >
            <div className="absolute inset-[-1px] overflow-hidden">
              <Image
                src={imgConfig.src}
                alt={imgConfig.alt}
                fill
                className="object-cover"
                sizes="80px"
                priority={index < 3}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
} 
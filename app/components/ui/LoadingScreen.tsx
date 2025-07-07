import { motion } from 'framer-motion';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 flex flex-col items-center justify-center z-50">
      {/* Pulsating Logo */}
      <motion.div
        className="mb-8"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <img 
          src="/logo-dark-styled.png" 
          alt="VxC Logo" 
          className="h-16 w-auto hidden dark:block"
        />
        <img 
          src="/chat-logo-light-styled.png" 
          alt="VxC Logo" 
          className="h-16 w-auto dark:hidden block"
        />
      </motion.div>

      {/* Three Dots Loading Animation */}
      <div className="flex space-x-2">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            className="w-3 h-3 bg-gray-600 dark:bg-gray-400 rounded-full"
            animate={{
              y: [0, -10, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: index * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
} 
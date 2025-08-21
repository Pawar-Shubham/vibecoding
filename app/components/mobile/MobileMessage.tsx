import { motion } from 'framer-motion';

export function MobileMessage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center px-6">
      <motion.div 
        className="text-center max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Logo */}
        <motion.div 
          className="mb-8"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <img
            src="/chat-logo-light-styled.png"
            alt="VxC Logo"
            className="h-16 w-auto mx-auto dark:hidden block"
          />
          <img
            src="/logo-dark-styled.png"
            alt="VxC Logo"
            className="h-16 w-auto mx-auto hidden dark:block"
          />
        </motion.div>

        {/* Main Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
            VxC Mobile is on its way ⚡
          </h1>
          
          <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
          We're building something incredible for your mobile experience. 
          Our team is hard at work bringing VxC to your fingertips - STAY TUNED!
          </p>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-blue-800 dark:text-blue-200 font-medium">
              💻 For now, enjoy the full VxC experience on your desktop or laptop!
            </p>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Thank you for your patience as we perfect every detail.
          </p>
        </motion.div>

        {/* Social Links */}
        <motion.div 
          className="flex justify-center gap-4 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <a
            href="https://x.com/vibesxcoded"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Follow us on X (Twitter)"
          >
            <div className="i-simple-icons:twitter text-xl" />
          </a>
          <a
            href="https://www.linkedin.com/company/vibesxcoded/about/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Follow us on LinkedIn"
          >
            <div className="i-simple-icons:linkedin text-xl" />
          </a>
          <a
            href="https://discord.gg/UrPWWrzPqt"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Join our Discord"
          >
            <div className="i-simple-icons:discord text-xl" />
          </a>
        </motion.div>
      </motion.div>
    </div>
  );
}
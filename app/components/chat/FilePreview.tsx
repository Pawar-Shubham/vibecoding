import React from 'react';

interface FilePreviewProps {
  files: File[];
  imageDataList: string[];
  isProcessing?: boolean;
  onRemove: (index: number) => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({ files, imageDataList, isProcessing = false, onRemove }) => {
  console.log('FilePreview - Props received:', { files, imageDataList, isProcessing });
  if (!files || files.length === 0) {
    return null;
  }

  console.log('FilePreview - Rendering with:', { files, imageDataList, isProcessing });
  return (
    <div className="flex flex-row overflow-x-auto mx-2 -mt-1 p-2 bg-bolt-elements-background-depth-3 border border-b-none border-bolt-elements-borderColor rounded-lg rounded-b-none">
      {/* Image count indicator */}
      {files.length > 1 && (
        <div className="flex items-center justify-center px-2 py-1 mr-2 bg-bolt-elements-background-depth-2 rounded-lg text-xs text-bolt-elements-textSecondary border border-bolt-elements-borderColor">
          {files.length} images
        </div>
      )}
      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center justify-center px-2 py-1 mr-2 bg-bolt-elements-loader-progress bg-opacity-20 rounded-lg text-xs text-bolt-elements-loader-progress border border-bolt-elements-loader-progress">
          <div className="i-svg-spinners:90-ring-with-bg animate-spin mr-1"></div>
          Processing...
        </div>
      )}
      {files.map((file, index) => (
        <div key={file.name + file.size} className="mr-2 relative">
          {imageDataList[index] && (
            <div className="relative">
              <img 
                src={imageDataList[index]} 
                alt={file.name} 
                className={`max-h-20 rounded-lg transition-opacity ${isProcessing ? 'opacity-80' : 'opacity-100'}`} 
              />
              <button
                onClick={() => onRemove(index)}
                className="absolute -top-1 -right-1 z-10 bg-black rounded-full w-5 h-5 shadow-md hover:bg-gray-900 transition-colors flex items-center justify-center"
              >
                <div className="i-ph:x w-3 h-3 text-gray-200" />
              </button>
              <div className="absolute bottom-0 w-full h-5 flex items-center px-2 rounded-b-lg text-bolt-elements-textTertiary font-thin text-xs bg-bolt-elements-background-depth-2">
                <span className="truncate">{file.name}</span>
                <span className="ml-1 text-bolt-elements-textQuaternary">
                  ({file.size < 1024 * 1024 
                    ? `${(file.size / 1024).toFixed(0)}KB` 
                    : `${(file.size / 1024 / 1024).toFixed(1)}MB`})
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default FilePreview;

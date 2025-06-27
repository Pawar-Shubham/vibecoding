import React from 'react';
import { Dialog, DialogTitle, DialogDescription, DialogRoot } from '~/components/ui/Dialog';
import { useStore } from '@nanostores/react';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { QRCode } from 'react-qrcode-logo';

interface ExpoQrModalProps {
  open: boolean;
  onClose: () => void;
}

export const ExpoQrModal: React.FC<ExpoQrModalProps> = ({ open, onClose }) => {
  const expoUrl = useStore(expoUrlAtom);

  return (
    <DialogRoot open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog
        className="text-center !flex-col !mx-auto !text-center !max-w-md"
        showCloseButton={true}
        onClose={onClose}
      >
        <div className="border !border-bolt-elements-borderColor flex flex-col gap-5 justify-center items-center p-6 bg-bolt-elements-background-depth-2 rounded-md">
          <div className="i-bolt:expo-brand h-10 w-full invert dark:invert-none"></div>
          <DialogTitle className="text-bolt-elements-textTertiary text-lg font-semibold leading-6">
            Preview on your own Mobile Device
          </DialogTitle>
          <DialogDescription className="bg-bolt-elements-background-depth-3 max-w-sm rounded-md p-1 border border-bolt-elements-borderColor">
          Install Expo Go on your mobile phone (Android or iOS) and scan the QR code to get started.
          </DialogDescription>
          <div className="my-6 flex flex-col items-center">
            {expoUrl ? (
              <QRCode
                logoImage="/logo-light-styled.png"
                removeQrCodeBehindLogo={true}
                logoPadding={1}
                logoHeight={40}
                logoWidth={40}
                logoPaddingStyle="square"
                qrStyle="dots"
                eyeRadius={8}
                style={{
                  borderRadius: 16,
                  padding: 4,
                  backgroundColor: '#07f29c',
                }}
                value={expoUrl}
                size={200}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            ) : (
              <div className="text-gray-500 text-center">No Expo URL detected.</div>
            )}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
};

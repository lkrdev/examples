import { Box, Theme } from '@looker/components';
import styled, { keyframes } from 'styled-components';

const progressAnimation = keyframes`
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
`;

const ProgressBar = styled(Box)<{ visibility: 'visible' | 'hidden' }>`
    animation: ${progressAnimation} 1s linear infinite;
    visibility: ${({ visibility }) => visibility};
    height: 2px;
    width: 100%;
    background: ${({ theme }) => (theme as Theme).colors.key};
    border-radius: 2px;
    overflow: hidden;
`;

export default ProgressBar;

import React, { FunctionComponent } from "react";
import { IconProps } from "../icon/types";

export const MinusIcon: FunctionComponent<IconProps> = ({
  width = 17,
  height = 17,
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 17"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.33301 8.9248H12.6663"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
};

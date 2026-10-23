import { Text, type TextProps } from "react-native";

import { fontFamily, type FontWeightName } from "../../theme/tokens.ts";

export interface AppTextProps extends TextProps {
  weight?: FontWeightName;
}

export function AppText({
  weight = "regular",
  style,
  ...props
}: AppTextProps) {
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: fontFamily[weight],
          textAlign: "right",
          writingDirection: "rtl",
        },
        style,
      ]}
    />
  );
}

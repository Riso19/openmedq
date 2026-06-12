import React from 'react';
import { Text, type TextStyle, type TextProps } from 'react-native';

interface FormattedTextProps extends TextProps {
  children: string;
  style?: TextStyle | TextStyle[];
}

export function FormattedText({ children, style, ...props }: FormattedTextProps) {
  if (typeof children !== 'string') {
    return <Text style={style} {...props}>{children}</Text>;
  }

  // Split by bold (**), subscript (~), and superscript (^)
  const regex = /(\*\*.*?\*\*|~.*?~|\^.*?\^)/g;
  const parts = children.split(regex);

  const renderedParts = parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2);
      return (
        <Text key={index} style={{ fontWeight: 'bold' }}>
          {content}
        </Text>
      );
    }
    if (part.startsWith('~') && part.endsWith('~')) {
      const content = part.slice(1, -1);
      // Inline styles for subscript: smaller font and shifted down
      return (
        <Text key={index} style={{ fontSize: 10, lineHeight: 12, transform: [{ translateY: 3 }] }}>
          {content}
        </Text>
      );
    }
    if (part.startsWith('^') && part.endsWith('^')) {
      const content = part.slice(1, -1);
      // Inline styles for superscript: smaller font and shifted up
      return (
        <Text key={index} style={{ fontSize: 10, lineHeight: 12, transform: [{ translateY: -3 }] }}>
          {content}
        </Text>
      );
    }
    return part;
  });

  return (
    <Text style={style} {...props}>
      {renderedParts}
    </Text>
  );
}

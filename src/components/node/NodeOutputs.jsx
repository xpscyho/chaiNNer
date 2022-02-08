/* eslint-disable react/prop-types */
/* eslint-disable import/extensions */
import React, {
  memo,
} from 'react';
import GenericOutput from '../outputs/GenericOutput.jsx';

const NodeOutputs = ({ data }) => {
  const { outputs } = data;

  return outputs.map((output, i) => {
    switch (output.type) {
      default:
        return (
          <GenericOutput key={i} index={i} label={output.label} data={data} />
        );
    }
  });
};
export default memo(NodeOutputs);

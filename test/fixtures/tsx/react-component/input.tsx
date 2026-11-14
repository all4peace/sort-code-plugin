"use client";

import React, { memo, useState } from "react";
import styled from "styled-components";

const Wrapper = styled.div`
  padding: ${props => props.theme.space}px;
`;

interface Props {
  title: string;
}

export default function Card({ title }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Wrapper onClick={() => setOpen(!open)}>
      {/* don't break on apostrophes or } braces in JSX text */}
      <h1>{title} isn't "quoted" {"}"} {"{"}</h1>
      <Badge label="it's" />
      {open && <Details />}
    </Wrapper>
  );
}

function Details() {
  return <p>Details / not a regex /</p>;
}

const Badge = ({ label }: { label: string }) => <span>{label}</span>;

export const MemoCard = memo(Card);

export function useCard(): boolean {
  return true;
}

export type CardProps = Props;

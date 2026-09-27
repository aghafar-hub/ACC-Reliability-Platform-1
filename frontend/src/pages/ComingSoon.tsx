// Placeholder for a tab that's been added to the sidebar ahead of its own
// design/build pass (see navigation.ts's file comment). Deliberately plain —
// nothing about its layout should be read as a design decision.
export default function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p className="settings-intro">This tab is on the sidebar — its design is still to come.</p>
    </div>
  );
}

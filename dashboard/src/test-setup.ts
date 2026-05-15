import "@testing-library/jest-dom"

// jsdom does not implement scrollIntoView — stub it so LogViewer doesn't crash in tests
window.HTMLElement.prototype.scrollIntoView = () => {}

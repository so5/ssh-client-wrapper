process.on("unhandledRejection", console.dir);

//setup test framework
import * as chai from "chai";
import { expect } from "chai";
import sinonChai from "sinon-chai";
chai.use(sinonChai);
import { EOL } from "node:os";
import sinon from "sinon";

//testee
import { buff2String, stripTerminalSequences } from "../../lib/util.js";

describe("test for stripTerminalSequences", ()=>{
  it("should remove CSI sequences", ()=>{
    expect(stripTerminalSequences("\u001b[?25l\u001b[2J\u001b[m\u001b[Hhoge\u001b[?25h")).to.equal("hoge");
    expect(stripTerminalSequences("\u001b[?9001h\u001b[?1004h")).to.equal("");
    expect(stripTerminalSequences("\u001b[31;1mred\u001b[0m")).to.equal("red");
  });
  it("should remove OSC sequences terminated by BEL or ST", ()=>{
    expect(stripTerminalSequences("a\u001b]0;C:\\Windows\\ssh.exe\u0007b")).to.equal("ab");
    expect(stripTerminalSequences("a\u001b]0;title\u001b\\b")).to.equal("ab");
  });
  it("should keep the text, including line breaks and tabs", ()=>{
    expect(stripTerminalSequences("foo\r\n\tbar [x]\r\n")).to.equal("foo\r\n\tbar [x]\r\n");
  });
});

describe("test for buff2String", ()=>{
  it("should pass the string as it is on other platforms", ()=>{
    const func = sinon.stub();
    buff2String(func, Buffer.from("\u001b[Hhoge"), "linux");

    expect(func).to.have.been.calledOnceWith("\u001b[Hhoge");
  });
  it("should strip the sequences on win32", ()=>{
    const func = sinon.stub();
    buff2String(func, Buffer.from("\u001b[?25l\u001b[Hhoge\r\n\u001b]0;ssh.exe\u0007"), "win32");

    expect(func).to.have.been.calledOnceWith(`hoge${EOL}`);
  });
  it("should not call the function for a chunk which has only sequences on win32", ()=>{
    const func = sinon.stub();
    buff2String(func, Buffer.from("\u001b[?9001h\u001b[?1004h"), "win32");

    expect(func).to.not.have.been.called;
  });
});

import { Component, Input, Output, EventEmitter, HostListener } from "@angular/core";

@Component({ selector: "app-card", template: "<div></div>" })
export class CardComponent {
  @Output() closed = new EventEmitter<void>();
  @Input() title = "";
  private sub = "";

  constructor(private readonly service: CardService) {}

  @Input()
  set subtitle(value: string) {
    this.sub = value;
  }

  ngOnInit(): void {}

  @HostListener("window:resize")
  onResize(): void {}

  private reset(): void {}
}

class CardService {}

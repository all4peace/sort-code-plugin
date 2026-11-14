namespace Demo
{
    public class Widget
    {
        public void Apple() { }
        public void Zebra() { }

        #region Rendering

        public void RenderHead() { }

        protected void RenderBody() { }

        private void RenderTail() { }

        #endregion

        #region Events

        public event EventHandler Clicked;
        public event EventHandler Moved;

        #endregion

#pragma warning disable CS0618 // obsolete members below
        public void UseOldApiA() { }
        public void UseOldApiZ() { }
#pragma warning restore CS0618

        public void Banana() { }
        public void Mango() { }
    }
}

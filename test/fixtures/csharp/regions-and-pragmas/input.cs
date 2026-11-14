namespace Demo
{
    public class Widget
    {
        public void Zebra() { }
        public void Apple() { }

        #region Rendering

        private void RenderTail() { }

        public void RenderHead() { }

        protected void RenderBody() { }

        #endregion

        #region Events

        public event EventHandler Moved;
        public event EventHandler Clicked;

        #endregion

#pragma warning disable CS0618 // obsolete members below
        public void UseOldApiZ() { }
        public void UseOldApiA() { }
#pragma warning restore CS0618

        public void Mango() { }
        public void Banana() { }
    }
}
